import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { analyzePasteText } from '@/lib/pasteImport';

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
      savedDates.push(group.date);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
    return NextResponse.json({ error: message, savedDates }, { status: 500 });
  }

  return NextResponse.json({ ok: true, savedDates });
}
