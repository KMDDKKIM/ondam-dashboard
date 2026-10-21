import type { SupabaseClient } from '@supabase/supabase-js';
import { buildHerbCare, type HerbCareEntry, type HerbCareOrder } from '@/lib/herbCare';
import type { PackageBalance } from '@/lib/herbPackage';
import { addDaysKst } from '@/lib/kst';
import { loadPackageBalance } from './herbPackages';

// 케어 보드(원장 전용)에 원장이 직접 등록한 환자(care_board_patients)와, 그 환자의 한약 복용 현황·패키지 잔여·다음 해피콜.
// 자동으로 환자를 올리지 않고 원장이 하나하나 등록한 환자만 보여 준다(원장 요청, 2026-10-21).

export interface CarePatient {
  id: string;
  patientName: string;
  chartNo: string;
  memo: string;
}

export interface CarePatientStatus extends CarePatient {
  /** 가장 최근 처방전 기준 복용 현황(처방전이 없으면 null) */
  herb: HerbCareEntry | null;
  /** 그 환자의 다음 한약 해피콜 날짜(아직 안 한 것 중 가장 이른 날) */
  nextCallDate: string | null;
  /** 한약 패키지 잔여(패키지가 없으면 null) */
  balance: PackageBalance | null;
}

interface PatientRow {
  id: string;
  patient_name: string;
  chart_no: string | null;
  memo: string | null;
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
  const { data, error } = await supabase.from('care_board_patients').select('id, patient_name, chart_no, memo').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return (data as PatientRow[]).map((r) => ({ id: r.id, patientName: r.patient_name, chartNo: r.chart_no ?? '', memo: r.memo ?? '' }));
}

export async function addCarePatient(supabase: SupabaseClient, input: { patientName: string; chartNo: string; memo?: string }): Promise<void> {
  const { error } = await supabase.from('care_board_patients').insert({
    patient_name: input.patientName.trim(),
    chart_no: input.chartNo.trim() || null,
    memo: input.memo?.trim() || null,
  });
  if (error) throw error;
}

export async function deleteCarePatient(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('care_board_patients').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제하지 못했어요.');
}

/** 등록한 환자들의 한약 복용 현황·패키지 잔여·다음 해피콜을 한꺼번에 읽는다. 일부 조회가 실패해도 나머지는 보여 준다. */
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

  const next = new Map<string, string>();
  try {
    const { data } = await supabase
      .from('happy_call_manual_entries')
      .select('patient_name, call_date')
      .eq('call_type', '한약')
      .eq('done', false)
      .order('call_date', { ascending: true })
      .limit(1000);
    for (const c of (data ?? []) as { patient_name: string; call_date: string }[]) if (!next.has(c.patient_name)) next.set(c.patient_name, c.call_date);
  } catch {
    // 해피콜 일정 없이 보여 준다.
  }

  return Promise.all(
    patients.map(async (p) => {
      const mine = orders.filter((o) => (p.chartNo ? o.chartNo === p.chartNo : o.patientName === p.patientName));
      const herb = buildHerbCare(mine, today, 100000)[0] ?? null;
      const balance = await loadPackageBalance(supabase, { patientName: p.patientName, chartNo: p.chartNo }).catch(() => null);
      return { ...p, herb, nextCallDate: next.get(p.patientName) ?? null, balance };
    })
  );
}
