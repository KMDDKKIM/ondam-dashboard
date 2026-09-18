import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { analyzePasteText, computeReservationDerivedStats } from '@/lib/pasteImport';

// 예약시트 붙여넣기 → kh-ondam-reservation의 daily_records/reservations에 직접
// 쓴다. 같은 hanyak-ondam Supabase 프로젝트를 공유하지만 그쪽 RLS는 anon/
// authenticated를 전부 막아둔 구조라 admin(service_role) 클라이언트로만 쓸 수
// 있다(kh-ondam-reservation/supabase/schema.sql 참고). 그 앱의 엑셀 업로드와
// 동일하게, 붙여넣은 날짜의 기존 예약 목록은 통째로 대체된다.
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

  const admin = createAdminClient();
  const savedDates: string[] = [];
  try {
    for (const group of analysis.groups) {
      const { data: record, error: upsertError } = await admin
        .from('daily_records')
        .upsert({ date: group.date }, { onConflict: 'date', ignoreDuplicates: false })
        .select('id')
        .single();
      if (upsertError) throw upsertError;

      const { error: deleteError } = await admin.from('reservations').delete().eq('daily_record_id', record.id);
      if (deleteError) throw deleteError;

      const { error: insertError } = await admin.from('reservations').insert(
        group.rows.map((row) => ({
          daily_record_id: record.id,
          doctor_name: row.doctorName,
          time_label: row.timeLabel,
          patient_name: row.patientName,
          chart_no: row.chartNo,
          phone: row.phone,
          mobile: row.mobile,
          visit_status: row.visitStatus,
          treatment_area: row.treatmentArea,
          treatment: row.treatment,
          special_notes: row.specialNotes,
          memo: row.memo,
        }))
      );
      if (insertError) throw insertError;

      const stats = computeReservationDerivedStats(group.rows);
      const { error: statsError } = await admin
        .from('daily_records')
        .update({
          visit_count: stats.visitCount,
          reservation_count: stats.reservationCount,
          excluded_count: stats.excludedCount,
          excluded_names: stats.excludedNames,
          chuna_count: stats.chunaCount,
          chuna_names: stats.chunaNames,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);
      if (statsError) throw statsError;

      savedDates.push(group.date);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: message, savedDates }, { status: 500 });
  }

  return NextResponse.json({ ok: true, savedDates });
}

// 붙여넣기 칸 아래에 보여줄 최근 입력 기록 — 언제 예약 명단을 몇 건 넣었는지.
// daily_records.reservation_count 컬럼은 예전 마감 멘트 시절 값이 그대로 남아
// 있는 날짜가 있어(그 뒤로 예약 명단을 다시 저장한 적이 없으면) 실제 행 수와
// 어긋날 수 있다 — 그래서 reservations 테이블을 직접 세어서 보여준다(사이드바
// "(예약 N명)"과 같은 방식).
export async function GET() {
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
