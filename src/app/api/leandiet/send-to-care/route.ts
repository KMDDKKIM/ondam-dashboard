import { NextResponse } from 'next/server';
import { DIET_CARE_MEMO } from '@/lib/careKind';
import { samePatient } from '@/lib/dietReminders';
import { todayKst } from '@/lib/kst';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentApprovedStaff, requireApprovedStaff } from '@/lib/supabase/requireStaff';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/leandiet/send-to-care { leanPatientId, reportDate, patientName, phone, reason }
// 린다이어트 기록 체크에서 "원장 케어 보드로 보내기"를 누르면, 케어 보드(원장 전용 표)의 린다이어트 칸에 그 환자를 올리고 오늘 연락할 분으로 띄운다.
// 케어 보드 표는 원장만 쓸 수 있어서(RLS) 직원이 누른 경우도 서버에서 대신 처리한다. 같은 리포트 날짜의 같은 환자는 한 번만 보낼 수 있다.
export async function POST(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const me = await getCurrentApprovedStaff();

  let body: { leanPatientId?: string; reportDate?: string; patientName?: string; phone?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const leanPatientId = (body.leanPatientId ?? '').trim();
  const patientName = (body.patientName ?? '').trim();
  const reportDate = body.reportDate ?? '';
  const reason = (body.reason ?? '').trim().slice(0, 200);
  if (!leanPatientId || !patientName || !DATE.test(reportDate)) {
    return NextResponse.json({ error: '환자와 리포트 날짜가 필요합니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: already } = await admin
    .from('leandiet_followups')
    .select('id')
    .eq('lean_patient_id', leanPatientId)
    .eq('report_date', reportDate)
    .eq('target', 'owner')
    .maybeSingle();
  if (already) return NextResponse.json({ action: 'exists' });

  const today = todayKst();
  const stamp = `[${Number(today.slice(5, 7))}/${Number(today.slice(8, 10))} 기록 체크] ${reason || '기록 확인'}`;

  const { data, error } = await admin.from('care_board_patients').select('id, patient_name, chart_no, status, kind, memo, next_call_date');
  if (error) return NextResponse.json({ error: '케어 보드를 읽지 못했어요.' }, { status: 500 });
  type Row = { id: string; patient_name: string; chart_no: string | null; status: string | null; kind: string | null; memo: string | null; next_call_date: string | null };
  const rows = ((data ?? []) as Row[]).filter(
    (r) => r.kind === 'diet' && samePatient({ patientName: r.patient_name, chartNo: r.chart_no ?? '' }, { patientName, chartNo: '' })
  );

  let carePatientId: string;
  if (rows.length > 0) {
    const target = rows.find((r) => (r.status ?? 'active') === 'active') ?? rows[0];
    const memo = [stamp, target.memo?.trim()].filter(Boolean).join('\n');
    // 해피콜 날짜는 오늘로 앞당기되, 이미 더 빠른(밀린) 날짜가 있으면 그대로 둔다.
    const next = target.next_call_date && target.next_call_date < today ? target.next_call_date : today;
    const { error: updateError } = await admin
      .from('care_board_patients')
      .update({ memo, next_call_date: next, status: 'active', ended_at: null })
      .eq('id', target.id);
    if (updateError) return NextResponse.json({ error: '케어 보드에 올리지 못했어요.' }, { status: 500 });
    carePatientId = target.id;
  } else {
    const { data: inserted, error: insertError } = await admin
      .from('care_board_patients')
      .insert({ patient_name: patientName, kind: 'diet', memo: `${stamp}\n${DIET_CARE_MEMO}`, next_call_date: today })
      .select('id')
      .single();
    if (insertError || !inserted) return NextResponse.json({ error: '케어 보드에 올리지 못했어요.' }, { status: 500 });
    carePatientId = inserted.id as string;
  }

  await admin.from('leandiet_followups').insert({
    lean_patient_id: leanPatientId,
    report_date: reportDate,
    target: 'owner',
    patient_name: patientName,
    phone: (body.phone ?? '').trim() || null,
    reason: reason || null,
    care_patient_id: carePatientId,
    created_by: me?.id ?? null,
  });
  return NextResponse.json({ action: rows.length > 0 ? 'updated' : 'added' });
}
