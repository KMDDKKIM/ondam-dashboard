import type { SupabaseClient } from '@supabase/supabase-js';
import type { HerbCompoundingOrder, HerbLine } from '@/lib/herbCompounding';

interface HerbCompoundingRow {
  id: string;
  patient_name: string;
  chart_no: string | null;
  order_date: string;
  packet_count: number;
  pack_volume_ml: number | null;
  days_supply: number | null;
  pack_count: number | null;
  total_liquid_ml: number | null;
  herbs: HerbLine[];
  memo: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: HerbCompoundingRow): HerbCompoundingOrder {
  return {
    id: row.id,
    patientName: row.patient_name,
    chartNo: row.chart_no ?? '',
    orderDate: row.order_date,
    packetCount: Number(row.packet_count),
    packVolumeMl: row.pack_volume_ml != null ? Number(row.pack_volume_ml) : 0,
    daysSupply: row.days_supply != null ? Number(row.days_supply) : 0,
    packCount: row.pack_count != null ? Number(row.pack_count) : 0,
    totalLiquidMl: row.total_liquid_ml != null ? Number(row.total_liquid_ml) : 0,
    herbs: row.herbs,
    memo: row.memo ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NewHerbCompoundingOrder {
  patientName: string;
  chartNo: string;
  orderDate: string;
  packetCount: number;
  packVolumeMl: number;
  daysSupply: number;
  packCount: number;
  totalLiquidMl: number;
  herbs: HerbLine[];
  memo: string;
  createdBy: string | null;
}

export async function createHerbCompoundingOrder(
  supabase: SupabaseClient,
  input: NewHerbCompoundingOrder
): Promise<HerbCompoundingOrder> {
  const { data, error } = await supabase
    .from('herb_compounding_orders')
    .insert({
      patient_name: input.patientName,
      chart_no: input.chartNo || null,
      order_date: input.orderDate,
      packet_count: input.packetCount,
      pack_volume_ml: input.packVolumeMl || null,
      days_supply: input.daysSupply || null,
      pack_count: input.packCount || null,
      total_liquid_ml: input.totalLiquidMl || null,
      herbs: input.herbs,
      memo: input.memo || null,
      created_by: input.createdBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  return fromRow(data as HerbCompoundingRow);
}

export async function getHerbCompoundingOrder(supabase: SupabaseClient, id: string): Promise<HerbCompoundingOrder | null> {
  const { data, error } = await supabase.from('herb_compounding_orders').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as HerbCompoundingRow) : null;
}

// 목록 화면(과거 기록)에는 약재 줄 전체가 필요 없다 — 가볍게 요약만 가져온다.
export interface HerbCompoundingSummary {
  id: string;
  patientName: string;
  chartNo: string;
  orderDate: string;
  packetCount: number;
  herbCount: number;
  createdAt: string;
}

// RLS가 막으면 에러 없이 0행이 지워지므로 실제로 지워졌는지 확인한다.
export async function deleteHerbCompoundingOrder(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('herb_compounding_orders').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제하지 못했습니다.');
}

export async function listRecentHerbCompoundingOrders(
  supabase: SupabaseClient,
  limit = 100
): Promise<HerbCompoundingSummary[]> {
  const { data, error } = await supabase
    .from('herb_compounding_orders')
    .select('id, patient_name, chart_no, order_date, packet_count, herbs, created_at')
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as (HerbCompoundingRow & { herbs: HerbLine[] })[]).map((row) => ({
    id: row.id,
    patientName: row.patient_name,
    chartNo: row.chart_no ?? '',
    orderDate: row.order_date,
    packetCount: Number(row.packet_count),
    herbCount: row.herbs.filter((h) => h.herbName.trim() !== '').length,
    createdAt: row.created_at,
  }));
}

export interface KnownHerbPatient {
  patientName: string;
  chartNo: string;
}

// 처방 입력 화면의 "전에 저장한 사람이면 다시 고르기" 자동완성용. 차트번호가 없는 사람도
// (신환 등) 후보에 넣는다 — 차트번호로 거르면 정작 그 사람에게는 이 기능이 무용해진다.
// 이름+차트번호 조합이 같으면 하나로 묶는다.
export async function listKnownHerbCompoundingPatients(supabase: SupabaseClient): Promise<KnownHerbPatient[]> {
  const { data, error } = await supabase
    .from('herb_compounding_orders')
    .select('patient_name, chart_no')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  const seen = new Map<string, KnownHerbPatient>();
  for (const row of data as { patient_name: string; chart_no: string | null }[]) {
    const chartNo = row.chart_no ?? '';
    const key = `${row.patient_name}\u0000${chartNo}`;
    if (!seen.has(key)) seen.set(key, { patientName: row.patient_name, chartNo });
  }
  return Array.from(seen.values());
}
