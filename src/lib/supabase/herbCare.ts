import type { SupabaseClient } from '@supabase/supabase-js';
import { buildHerbCare, type HerbCareEntry, type HerbCareOrder } from '@/lib/herbCare';
import { addDaysKst } from '@/lib/kst';

interface OrderRow {
  patient_name: string;
  chart_no: string | null;
  prescription_name: string | null;
  order_date: string;
  pickup_date?: string | null;
  days_supply: number | string | null;
  packet_count: number | string | null;
}

export interface HerbCareItem extends HerbCareEntry {
  /** 그 환자의 다음 한약 해피콜 날짜(아직 안 한 것 중 가장 이른 날) */
  nextCallDate: string | null;
}

/** 케어 보드의 "한약 복용중" 명단 — 최근 처방전과 한약 해피콜 일정을 읽어 합친다. */
export async function loadHerbCare(supabase: SupabaseClient, today: string): Promise<HerbCareItem[]> {
  const { data, error } = await supabase
    .from('herb_compounding_orders')
    .select('patient_name, chart_no, prescription_name, order_date, pickup_date, days_supply, packet_count')
    .gte('order_date', addDaysKst(today, -150))
    .order('order_date', { ascending: false })
    .limit(1000);
  if (error) throw error;
  const orders: HerbCareOrder[] = (data as OrderRow[]).map((r) => ({
    patientName: r.patient_name,
    chartNo: r.chart_no ?? '',
    prescriptionName: r.prescription_name ?? '',
    orderDate: r.order_date,
    pickupDate: r.pickup_date ?? null,
    daysSupply: r.days_supply == null ? null : Number(r.days_supply),
    packetCount: r.packet_count == null ? null : Number(r.packet_count),
  }));
  const entries = buildHerbCare(orders, today);
  if (entries.length === 0) return [];

  // 다음 한약 해피콜(수령확인·중간상담) — 같은 이름의 아직 안 한 콜 중 가장 이른 날. 못 읽어도 명단은 보여 준다.
  const next = new Map<string, string>();
  try {
    const { data: calls } = await supabase
      .from('happy_call_manual_entries')
      .select('patient_name, call_date')
      .eq('call_type', '한약')
      .eq('done', false)
      .order('call_date', { ascending: true })
      .limit(1000);
    for (const c of (calls ?? []) as { patient_name: string; call_date: string }[]) {
      if (!next.has(c.patient_name)) next.set(c.patient_name, c.call_date);
    }
  } catch {
    // 해피콜 일정 없이 보여 준다.
  }
  return entries.map((e) => ({ ...e, nextCallDate: next.get(e.patientName) ?? null }));
}
