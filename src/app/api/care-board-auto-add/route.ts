import { NextResponse } from 'next/server';
import { CARE_KINDS, dietCareDefaults, type CareKind } from '@/lib/careKind';
import { samePatient } from '@/lib/dietReminders';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';

// POST /api/care-board-auto-add { patientName, chartNo, kind } — 한약·공진단·경옥고·린다이어트를 결제하면 원장 케어 보드에 자동으로 올린다.
// 케어 보드 표는 원장만 읽고 쓸 수 있어서(RLS), 결제를 등록한 직원(데스크 등)이 대신 올릴 수 있게 서버에서 처리한다.
// 이미 진행 중으로 올라와 있으면 그대로 두고(비어 있는 해피콜 날짜·메모만 채운다), 종료했던 환자가 다시 결제하면 다시 진행으로 돌린다. 한 종류에 같은 환자는 한 번만 올라간다.
// 린다이어트 환자는 다음 해피콜 날짜를 디톡스 시작일 + 3일로, 메모를 해피콜 안내 문구로 채운다(원장 요청, 2026-10-23).
export async function POST(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;

  let body: { patientName?: string; chartNo?: string; kind?: string; detoxStartDate?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const patientName = (body.patientName ?? '').trim();
  const chartNo = (body.chartNo ?? '').trim();
  const kind = body.kind as CareKind;
  const detoxStart = typeof body.detoxStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.detoxStartDate) ? body.detoxStartDate : null;
  if (!patientName || !CARE_KINDS.includes(kind)) return NextResponse.json({ error: '환자 이름과 종류가 필요합니다.' }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from('care_board_patients').select('id, patient_name, chart_no, status, kind, memo, next_call_date');
  if (error) return NextResponse.json({ action: 'skipped' });
  const rows = ((data ?? []) as { id: string; patient_name: string; chart_no: string | null; status: string | null; kind: string | null; memo: string | null; next_call_date: string | null }[]).filter(
    (r) => (r.kind ?? 'herb') === kind && samePatient({ patientName: r.patient_name, chartNo: r.chart_no ?? '' }, { patientName, chartNo })
  );

  const defaults = kind === 'diet' ? dietCareDefaults(detoxStart) : null;

  if (rows.length > 0) {
    const active = rows.find((r) => (r.status ?? 'active') === 'active');
    const target = active ?? rows[0];
    // 이미 있는 환자는 비어 있는 칸만 채운다(원장이 적은 메모·날짜는 덮어쓰지 않는다).
    const fill: Record<string, unknown> = {};
    if (defaults && !target.memo?.trim()) fill.memo = defaults.memo;
    if (defaults?.nextCallDate && !target.next_call_date) fill.next_call_date = defaults.nextCallDate;
    if (!active) Object.assign(fill, { status: 'active', ended_at: null });
    if (Object.keys(fill).length > 0) await admin.from('care_board_patients').update(fill).eq('id', target.id);
    return NextResponse.json({ action: active ? 'exists' : 'reactivated' });
  }
  const { error: insertError } = await admin.from('care_board_patients').insert({
    patient_name: patientName,
    chart_no: chartNo || null,
    ...(kind !== 'herb' ? { kind } : {}),
    ...(defaults ? { memo: defaults.memo, next_call_date: defaults.nextCallDate } : {}),
  });
  return NextResponse.json({ action: insertError ? 'skipped' : 'added' });
}
