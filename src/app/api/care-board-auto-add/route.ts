import { NextResponse } from 'next/server';
import { CARE_KINDS, type CareKind } from '@/lib/careKind';
import { samePatient } from '@/lib/dietReminders';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';

// POST /api/care-board-auto-add { patientName, chartNo, kind } — 한약·공진단·경옥고·린다이어트를 결제하면 원장 케어 보드에 자동으로 올린다.
// 케어 보드 표는 원장만 읽고 쓸 수 있어서(RLS), 결제를 등록한 직원(데스크 등)이 대신 올릴 수 있게 서버에서 처리한다.
// 이미 진행 중으로 올라와 있으면 그대로 두고, 종료했던 환자가 다시 결제하면 다시 진행으로 돌린다. 한 종류에 같은 환자는 한 번만 올라간다.
export async function POST(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;

  let body: { patientName?: string; chartNo?: string; kind?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const patientName = (body.patientName ?? '').trim();
  const chartNo = (body.chartNo ?? '').trim();
  const kind = body.kind as CareKind;
  if (!patientName || !CARE_KINDS.includes(kind)) return NextResponse.json({ error: '환자 이름과 종류가 필요합니다.' }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from('care_board_patients').select('id, patient_name, chart_no, status, kind');
  if (error) return NextResponse.json({ action: 'skipped' });
  const rows = ((data ?? []) as { id: string; patient_name: string; chart_no: string | null; status: string | null; kind: string | null }[]).filter(
    (r) => (r.kind ?? 'herb') === kind && samePatient({ patientName: r.patient_name, chartNo: r.chart_no ?? '' }, { patientName, chartNo })
  );

  if (rows.length > 0) {
    const active = rows.find((r) => (r.status ?? 'active') === 'active');
    if (active) return NextResponse.json({ action: 'exists' });
    await admin.from('care_board_patients').update({ status: 'active', ended_at: null }).eq('id', rows[0].id);
    return NextResponse.json({ action: 'reactivated' });
  }
  const { error: insertError } = await admin.from('care_board_patients').insert({
    patient_name: patientName,
    chart_no: chartNo || null,
    ...(kind !== 'herb' ? { kind } : {}),
  });
  return NextResponse.json({ action: insertError ? 'skipped' : 'added' });
}
