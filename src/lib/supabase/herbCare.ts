import type { SupabaseClient } from '@supabase/supabase-js';
import { buildHerbCare, summarizeCalls, type CallSummary, type HerbCareEntry, type HerbCareOrder } from '@/lib/herbCare';
import { isCountedOrder, packageBalance, type PackageBalance } from '@/lib/herbPackage';
import { addDaysKst, kstDateOf } from '@/lib/kst';
import type { PatientPackage } from './herbPackages';

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
  /** 원장이 정한 다음 해피콜 날짜 — 그날 "오늘 연락할 분"에 뜬다 */
  nextCallDate: string | null;
  /** 원장이 해피콜을 마친 마지막 날짜 */
  lastCallDate: string | null;
}

export interface CarePatientStatus extends CarePatient {
  /** 가장 최근 처방전 기준 복용 현황(처방전이 없으면 null) */
  herb: HerbCareEntry | null;
  /** 데스크 해피콜 목록에서 본 마지막·다음 해피콜 */
  desk: CallSummary;
  /** 한약 패키지(결제·처방·잔여 일수, 패키지가 없으면 null) */
  balance: PackageBalance | null;
  /** 이 환자의 패키지 결제 기록 */
  packages: PatientPackage[];
}

interface PatientRow {
  id: string;
  patient_name: string;
  chart_no: string | null;
  memo: string | null;
  status?: CareStatus | null;
  ended_at?: string | null;
  next_call_date?: string | null;
  last_call_date?: string | null;
}

interface OrderRow {
  patient_name: string;
  chart_no: string | null;
  prescription_name: string | null;
  order_date: string;
  pickup_date?: string | null;
  days_supply: number | string | null;
  packet_count: number | string | null;
  printed_at: string | null;
  herbs: { herbName?: string }[] | null;
}

const FULL_COLUMNS = 'id, patient_name, chart_no, memo, status, ended_at, next_call_date, last_call_date';
const BASIC_COLUMNS = 'id, patient_name, chart_no, memo';

function rowToPatient(r: PatientRow): CarePatient {
  return {
    id: r.id,
    patientName: r.patient_name,
    chartNo: r.chart_no ?? '',
    memo: r.memo ?? '',
    status: r.status === 'ended' ? 'ended' : 'active',
    endedAt: r.ended_at ?? null,
    nextCallDate: r.next_call_date ?? null,
    lastCallDate: r.last_call_date ?? null,
  };
}

export async function listCarePatients(supabase: SupabaseClient): Promise<CarePatient[]> {
  // 종료·해피콜 날짜 칸을 만드는 SQL을 아직 실행하지 않았어도 목록은 보이게 한다(모두 진행 중으로 본다).
  const read = (columns: string) => supabase.from('care_board_patients').select(columns).order('created_at', { ascending: false }).limit(300);
  let result = await read(FULL_COLUMNS);
  if (result.error && /status|ended_at|next_call_date|last_call_date/.test(result.error.message)) result = await read(BASIC_COLUMNS);
  if (result.error) throw result.error;
  return ((result.data ?? []) as unknown as PatientRow[]).map(rowToPatient);
}

/** 오늘(또는 그 전) 해피콜 날짜가 된 진행 중인 환자 — "오늘 연락할 분"에 올린다. 칸이 아직 없거나 읽기에 실패하면 던진다. */
export async function listCareDue(supabase: SupabaseClient, today: string): Promise<CarePatient[]> {
  const { data, error } = await supabase
    .from('care_board_patients')
    .select(FULL_COLUMNS)
    .eq('status', 'active')
    .not('next_call_date', 'is', null)
    .lte('next_call_date', today)
    .order('next_call_date', { ascending: true })
    .limit(300);
  if (error) throw error;
  return ((data ?? []) as unknown as PatientRow[]).map(rowToPatient);
}

export async function addCarePatient(supabase: SupabaseClient, input: { patientName: string; chartNo: string; memo?: string }): Promise<string> {
  const { data, error } = await supabase
    .from('care_board_patients')
    .insert({ patient_name: input.patientName.trim(), chart_no: input.chartNo.trim() || null, memo: input.memo?.trim() || null })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export interface CarePatientPatch {
  memo?: string;
  status?: CareStatus;
  endedAt?: string | null;
  nextCallDate?: string | null;
  lastCallDate?: string | null;
}

/** 메모·종료·다음 해피콜 날짜·마지막 해피콜 날짜를 저장한다. 빈 날짜는 비운다. */
export async function updateCarePatient(supabase: SupabaseClient, id: string, patch: CarePatientPatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.memo !== undefined) row.memo = patch.memo.trim() || null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.endedAt !== undefined) row.ended_at = patch.endedAt || null;
  if (patch.nextCallDate !== undefined) row.next_call_date = patch.nextCallDate || null;
  if (patch.lastCallDate !== undefined) row.last_call_date = patch.lastCallDate || null;
  const { data, error } = await supabase.from('care_board_patients').update(row).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('저장하지 못했어요.');
}

/** 등록한 환자들의 한약 복용 현황·패키지·해피콜 현황을 한꺼번에 읽는다. 일부 조회가 실패해도 나머지는 보여 준다. */
export async function loadCarePatientStatus(supabase: SupabaseClient, patients: CarePatient[], today: string): Promise<CarePatientStatus[]> {
  if (patients.length === 0) return [];

  let orders: (HerbCareOrder & { printedAt: string | null })[] = [];
  try {
    const { data, error } = await supabase
      .from('herb_compounding_orders')
      .select('patient_name, chart_no, prescription_name, order_date, pickup_date, days_supply, packet_count, printed_at, herbs')
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
      printedAt: r.printed_at,
      herbNames: Array.isArray(r.herbs) ? r.herbs.map((h) => h.herbName ?? '').filter(Boolean) : [],
    }));
  } catch {
    orders = [];
  }

  let packageRows: { id: string; patient_name: string; chart_no: string | null; total_days: number; start_date: string; purchase_id: string | null }[] = [];
  try {
    const { data } = await supabase.from('herb_packages').select('id, patient_name, chart_no, total_days, start_date, purchase_id').limit(2000);
    packageRows = (data ?? []) as typeof packageRows;
  } catch {
    packageRows = [];
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

  return patients.map((p) => {
    // 차트번호가 있으면 차트번호로, 없으면 이름으로 환자의 처방전·패키지를 찾는다(처방전 쪽 차트번호가 비어 있으면 이름이 같을 때 그 환자의 것으로 본다).
    const orderMatches = (chartNo: string, name: string) => (p.chartNo ? chartNo === p.chartNo || (!chartNo && name === p.patientName) : name === p.patientName);
    const mine = orders.filter((o) => orderMatches(o.chartNo, o.patientName));
    const herb = buildHerbCare(mine, today, 100000)[0] ?? null;
    const myPackages = packageRows.filter((k) => (p.chartNo ? (k.chart_no ?? '') === p.chartNo : k.patient_name === p.patientName));
    const packages: PatientPackage[] = myPackages.map((k) => ({ id: k.id, totalDays: k.total_days, startDate: k.start_date, manual: k.purchase_id == null }));
    const balance = packageBalance(
      packages.map((k) => ({ totalDays: k.totalDays, startDate: k.startDate })),
      mine.filter((o) => isCountedOrder({ orderDate: o.orderDate, printedAt: o.printedAt }))
    );
    return { ...p, herb, balance, packages, desk: summarizeCalls(callsByName.get(p.patientName) ?? [], kstDateOf) };
  });
}
