import type { SupabaseClient } from '@supabase/supabase-js';
import { buildHerbCare, summarizeCalls, type CallSummary, type HerbCareEntry, type HerbCareOrder } from '@/lib/herbCare';
import type { PackageBalance } from '@/lib/herbPackage';
import { addDaysKst, kstDateOf } from '@/lib/kst';
import { loadPackageBalance } from './herbPackages';

// 케어 보드(원장 전용)에 원장이 직접 등록한 환자(care_board_patients)와, 그 환자의 한약 복용 현황·패키지 잔여·해피콜 현황.
// 자동으로 환자를 올리지 않고 원장이 하나하나 등록한 환자만 보여 준다(원장 요청, 2026-10-21).

export type CareStatus = 'active' | 'ended';

export interface CarePatient {
  id: string;
  patientName: string;
  chartNo: string;
  /** 중점 해피콜 사항·지난 상담 내용 같은 원장 메모 */
  memo: string;
  status: CareStatus;
  endedAt: string | null;
}

export interface CarePatientStatus extends CarePatient {
  /** 가장 최근 처방전 기준 복용 현황(처방전이 없으면 null) */
  herb: HerbCareEntry | null;
  /** 마지막 해피콜 날짜와 다음 해피콜 날짜 */
  calls: CallSummary;
  /** 한약 패키지(결제·처방·잔여 일수, 패키지가 없으면 null) */
  balance: PackageBalance | null;
}

interface PatientRow {
  id: string;
  patient_name: string;
  chart_no: string | null;
  memo: string | null;
  status?: CareStatus | null;
  ended_at?: string | null;
}

interface OrderRow {
  patient_name: string;
  chart_no: string | null;
  prescription_name: string | null;
  order_date: string;
  pickup_date?: string | null;
  days_supply: number | string | null;
  packet_count: number | string | null;
}

export async function listCarePatients(supabase: SupabaseClient): Promise<CarePatient[]> {
  // 종료 상태 칸을 만드는 SQL(migration_care_board_status.sql)을 아직 실행하지 않았어도 목록은 보이게 한다(모두 진행 중으로 본다).
  const read = (columns: string) => supabase.from('care_board_patients').select(columns).order('created_at', { ascending: false }).limit(300);
  let result = await read('id, patient_name, chart_no, memo, status, ended_at');
  if (result.error && /status|ended_at/.test(result.error.message)) result = await read('id, patient_name, chart_no, memo');
  if (result.error) throw result.error;
  return ((result.data ?? []) as unknown as PatientRow[]).map((r) => ({
    id: r.id,
    patientName: r.patient_name,
    chartNo: r.chart_no ?? '',
    memo: r.memo ?? '',
    status: r.status === 'ended' ? 'ended' : 'active',
    endedAt: r.ended_at ?? null,
  }));
}

export async function addCarePatient(supabase: SupabaseClient, input: { patientName: string; chartNo: string; memo?: string }): Promise<void> {
  const { error } = await supabase.from('care_board_patients').insert({
    patient_name: input.patientName.trim(),
    chart_no: input.chartNo.trim() || null,
    memo: input.memo?.trim() || null,
  });
  if (error) throw error;
}

/** 메모를 저장하거나 종료·다시 진행으로 바꾼다. */
export async function updateCarePatient(supabase: SupabaseClient, id: string, patch: { memo?: string; status?: CareStatus; endedAt?: string | null }): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.memo !== undefined) row.memo = patch.memo.trim() || null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.endedAt !== undefined) row.ended_at = patch.endedAt;
  const { data, error } = await supabase.from('care_board_patients').update(row).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('저장하지 못했어요.');
}

/** 등록한 환자들의 한약 복용 현황·패키지·해피콜 현황을 한꺼번에 읽는다. 일부 조회가 실패해도 나머지는 보여 준다. */
export async function loadCarePatientStatus(supabase: SupabaseClient, patients: CarePatient[], today: string): Promise<CarePatientStatus[]> {
  if (patients.length === 0) return [];

  let orders: HerbCareOrder[] = [];
  try {
    const { data, error } = await supabase
      .from('herb_compounding_orders')
      .select('patient_name, chart_no, prescription_name, order_date, pickup_date, days_supply, packet_count')
      .gte('order_date', addDaysKst(today, -400))
      .order('order_date', { ascending: false })
      .limit(2000);
    if (error) throw error;
    orders = (data as OrderRow[]).map((r) => ({
      patientName: r.patient_name,
      chartNo: r.chart_no ?? '',
      prescriptionName: r.prescription_name ?? '',
      orderDate: r.order_date,
      pickupDate: r.pickup_date ?? null,
      daysSupply: r.days_supply == null ? null : Number(r.days_supply),
      packetCount: r.packet_count == null ? null : Number(r.packet_count),
    }));
  } catch {
    orders = [];
  }

  // 해피콜(종류 상관없이) — 이름이 같은 해피콜을 모아 마지막으로 전화한 날과 다음 해피콜 날짜를 구한다.
  const callsByName = new Map<string, { callDate: string; done: boolean; completedAt: string | null }[]>();
  try {
    const names = [...new Set(patients.map((p) => p.patientName))];
    const { data } = await supabase.from('happy_call_manual_entries').select('patient_name, call_date, done, completed_at').in('patient_name', names).limit(3000);
    for (const c of (data ?? []) as { patient_name: string; call_date: string; done: boolean; completed_at: string | null }[]) {
      const list = callsByName.get(c.patient_name) ?? [];
      list.push({ callDate: c.call_date, done: c.done, completedAt: c.completed_at });
      callsByName.set(c.patient_name, list);
    }
  } catch {
    // 해피콜 일정 없이 보여 준다.
  }

  return Promise.all(
    patients.map(async (p) => {
      const mine = orders.filter((o) => (p.chartNo ? o.chartNo === p.chartNo : o.patientName === p.patientName));
      const herb = buildHerbCare(mine, today, 100000)[0] ?? null;
      const balance = await loadPackageBalance(supabase, { patientName: p.patientName, chartNo: p.chartNo }).catch(() => null);
      return { ...p, herb, balance, calls: summarizeCalls(callsByName.get(p.patientName) ?? [], kstDateOf) };
    })
  );
}
