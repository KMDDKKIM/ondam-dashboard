import type { SupabaseClient } from '@supabase/supabase-js';
import type { NonCoveredPurchase } from '@/lib/types';
import { createManualEntry, updateManualEntryCallDate } from './happyCallQueue';

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
  happy_call_date: string | null;
  happy_call_entry_id: string | null;
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
    happyCallDate: row.happy_call_date,
    happyCallEntryId: row.happy_call_entry_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// 구매일 기준 기본 해피콜 예정일 — 구매 후 일주일 뒤 사용감을 확인하는 통상적인
// 주기로 잡았다. 등록 폼에서 그대로 고쳐 쓸 수 있다.
export function defaultHappyCallDate(purchaseDate: string): string {
  const [y, m, d] = purchaseDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
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
  happyCallDate: string | null;
  createdBy: string | null;
}

// 해피콜 예정일이 있으면 happy_call_manual_entries에도 행을 만들어(구매 정보를
// 메모로 남겨) 해피콜 목록/홈 화면에 그 날짜가 되면 뜨도록 연결하고, 만든 행의
// id를 non_covered_purchases.happy_call_entry_id에 남겨둔다.
export async function createNonCoveredPurchase(
  supabase: SupabaseClient,
  input: NewNonCoveredPurchase
): Promise<NonCoveredPurchase> {
  let happyCallEntryId: string | null = null;
  if (input.happyCallDate) {
    happyCallEntryId = await createManualEntry(supabase, {
      patientName: input.patientName,
      note: `비급여 구매 후속 - ${input.productName}`,
      callDate: input.happyCallDate,
      createdBy: input.createdBy,
    });
  }

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
      happy_call_date: input.happyCallDate,
      happy_call_entry_id: happyCallEntryId,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToPurchase(data as NonCoveredPurchaseRow);
}

// 해피콜 예정일만 나중에 고칠 때 — 이미 연결된 happy_call_manual_entries 행도
// 같이 갱신한다.
export async function updatePurchaseHappyCallDate(
  supabase: SupabaseClient,
  purchase: NonCoveredPurchase,
  newDate: string
): Promise<void> {
  if (purchase.happyCallEntryId) {
    await updateManualEntryCallDate(supabase, purchase.happyCallEntryId, newDate);
  }
  const { error } = await supabase
    .from('non_covered_purchases')
    .update({ happy_call_date: newDate })
    .eq('id', purchase.id);
  if (error) throw error;
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
