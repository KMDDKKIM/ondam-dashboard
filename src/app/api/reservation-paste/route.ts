import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiErrorResponse } from '@/lib/apiError';
import { analyzePasteText } from '@/lib/pasteImport';
import { countReservationsByDates, replaceReservationsForDate } from '@/lib/reservations/dailyRecords.server';

// 예약시트 붙여넣기 → kh-ondam-reservation의 daily_records/reservations에 직접
// 쓴다. 같은 hanyak-ondam Supabase 프로젝트를 공유하지만 그쪽 RLS는 anon/
// authenticated를 전부 막아둔 구조라 admin(service_role) 클라이언트로만 쓸 수
// 있다(kh-ondam-reservation/supabase/schema.sql 참고). 그 앱의 엑셀 업로드와
// 동일하게, 붙여넣은 날짜의 기존 예약 목록은 통째로 대체된다(DB 함수로 원자적으로).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { data: staff } = await supabase.from('staff').select('status').eq('id', user.id).maybeSingle();
  if (staff?.status !== 'approved') {
    return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const text = body && typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json({ error: '붙여넣은 내용이 없습니다.' }, { status: 400 });
  }

  const analysis = analyzePasteText(text);
  if (analysis.format !== 'reservation') {
    return NextResponse.json({ error: '예약시트 형식이 아닙니다.' }, { status: 400 });
  }

  const savedDates: string[] = [];
  try {
    for (const group of analysis.groups) {
      // 지우기+넣기는 DB 함수(replace_reservations) 안에서 한 트랜잭션 — 날짜 단위로 전부 되거나 전혀 안 된다.
      await replaceReservationsForDate(group.date, group.rows);
      savedDates.push(group.date);
    }
  } catch (err) {
    // 실제 오류는 서버 로그에만 남긴다(DB 오류 문구를 화면에 그대로 내보내지 않는다).
    return apiErrorResponse(err, { extra: { savedDates }, hideDetails: true });
  }

  return NextResponse.json({ ok: true, savedDates });
}

// 붙여넣기 칸 아래에 보여줄 최근 입력 기록 — 언제 예약 명단을 몇 건 넣었는지.
// daily_records.reservation_count 컬럼은 예전 마감 멘트 시절 값이 그대로 남아
// 있는 날짜가 있어(그 뒤로 예약 명단을 다시 저장한 적이 없으면) 실제 행 수와
// 어긋날 수 있다 — 그래서 reservations 테이블을 직접 세어서 보여준다(사이드바
// "(예약 N명)"과 같은 방식).
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { data: staff } = await supabase.from('staff').select('status').eq('id', user.id).maybeSingle();
  if (staff?.status !== 'approved') {
    return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });
  }

  // ?dates=2026-09-20,2026-09-21 — 붙여넣기 저장 전 "기존 N명 → 새 N명" 확인용으로 날짜별 현재 인원수만 돌려준다.
  const datesParam = request.nextUrl.searchParams.get('dates');
  if (datesParam !== null) {
    const dates = [...new Set(datesParam.split(',').map((d) => d.trim()))];
    if (dates.length === 0 || dates.length > 62 || !dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
      return NextResponse.json({ error: '날짜(dates=YYYY-MM-DD,...)가 올바르지 않습니다.' }, { status: 400 });
    }
    try {
      return NextResponse.json({ counts: await countReservationsByDates(dates) });
    } catch (err) {
      return apiErrorResponse(err, { hideDetails: true });
    }
  }

  const admin = createAdminClient();
  const { data: records, error: recordsError } = await admin
    .from('daily_records')
    .select('id, date, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(30);
  if (recordsError) {
    return NextResponse.json({ error: recordsError.message }, { status: 500 });
  }

  const ids = (records ?? []).map((r) => r.id);
  const { data: reservationRows, error: reservationsError } = await admin
    .from('reservations')
    .select('daily_record_id')
    .in('daily_record_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);
  if (reservationsError) {
    return NextResponse.json({ error: reservationsError.message }, { status: 500 });
  }

  const countByRecordId = new Map<string, number>();
  for (const row of reservationRows ?? []) {
    countByRecordId.set(row.daily_record_id, (countByRecordId.get(row.daily_record_id) ?? 0) + 1);
  }

  const withCounts = (records ?? [])
    .map((r) => ({ date: r.date, reservationCount: countByRecordId.get(r.id) ?? 0, updatedAt: r.updated_at }))
    .filter((r) => r.reservationCount > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  return NextResponse.json({ records: withCounts });
}
