import type { SupabaseClient } from '@supabase/supabase-js';
import type { NonCoveredPurchase } from '@/lib/types';

interface NonCoveredPurchaseRow {
  id: string;
  patient_name: string;
  chart_no: string;
  phone: string | null;
  category: string;
  product_name: string;
  amount: number | null;
  purchase_date: string;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

function rowToPurchase(row: NonCoveredPurchaseRow): NonCoveredPurchase {
  return {
    id: row.id,
    patientName: row.patient_name,
    chartNo: row.chart_no,
    phone: row.phone,
    category: row.category,
    productName: row.product_name,
    amount: row.amount != null ? Number(row.amount) : null,
    purchaseDate: row.purchase_date,
    memo: row.memo,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listNonCoveredPurchases(supabase: SupabaseClient): Promise<NonCoveredPurchase[]> {
  const { data, error } = await supabase
    .from('non_covered_purchases')
    .select('*')
    .order('purchase_date', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data as NonCoveredPurchaseRow[]).map(rowToPurchase);
}

export interface NewNonCoveredPurchase {
  patientName: string;
  chartNo: string;
  phone: string | null;
  category: string;
  productName: string;
  amount: number | null;
  purchaseDate: string;
  memo: string | null;
  createdBy: string | null;
}

export async function createNonCoveredPurchase(
  supabase: SupabaseClient,
  input: NewNonCoveredPurchase
): Promise<NonCoveredPurchase> {
  const { data, error } = await supabase
    .from('non_covered_purchases')
    .insert({
      patient_name: input.patientName,
      chart_no: input.chartNo,
      phone: input.phone,
      category: input.category,
      product_name: input.productName,
      amount: input.amount,
      purchase_date: input.purchaseDate,
      memo: input.memo,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToPurchase(data as NonCoveredPurchaseRow);
}

export interface KnownPatient {
  patientName: string;
  chartNo: string;
  phone: string | null;
}

// "한 번 입력하면 다음엔 검색해서 클릭" — 별도 환자 테이블 없이, 기존 구매
// 기록에서 이름/차트번호/연락처만 뽑아 중복 제거한 목록을 자동완성 후보로 쓴다.
export function listKnownPatients(purchases: NonCoveredPurchase[]): KnownPatient[] {
  const seen = new Map<string, KnownPatient>();
  for (const p of purchases) {
    if (!seen.has(p.chartNo)) {
      seen.set(p.chartNo, { patientName: p.patientName, chartNo: p.chartNo, phone: p.phone });
    }
  }
  return Array.from(seen.values());
}
