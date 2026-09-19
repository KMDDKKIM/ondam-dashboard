import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoalCategory, NonCoveredPurchase } from '@/lib/types';
import { createManualEntry, updateManualEntryCallDate } from './happyCallQueue';
import { addDays, computeHerbCallDates } from '@/lib/happyCallStats';

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
  happy_call_entry_id_2: string | null;
  happy_call_entry_id_3: string | null;
  duration_days: number | null;
  goal_category: GoalCategory | null;
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
    happyCallEntryId2: row.happy_call_entry_id_2,
    happyCallEntryId3: row.happy_call_entry_id_3,
    durationDays: row.duration_days,
    goalCategory: row.goal_category,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// 한약 수령일의 기본값 — 구매일 다음날(등록 폼에서 직접 고칠 수 있다). 1차 해피콜은
// 여기서 다시 하루 뒤(수령일 다음날)로 잡힌다.
export function defaultHappyCallDate(purchaseDate: string): string {
  return addDays(purchaseDate, 1);
}

export const DURATION_PRESETS = [15, 30, 60, 120];

// 특수한약으로 분류되는 품목 — 상품명을 여기서 골라 입력하면 "목표 반영"을
// 자동으로 특수한약으로 제안한다(그래도 등록 폼에서 직접 바꿀 수 있다).
export const SPECIAL_HERB_PRODUCTS = ['공진단', '경옥고', '녹용관절고', '보폐고엔오'];

export function suggestGoalCategory(productName: string): GoalCategory | null {
  return SPECIAL_HERB_PRODUCTS.some((name) => productName.includes(name)) ? 'special_herb' : null;
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

// 그 날짜에 등록된 구매만 — 일일 마무리 멘트의 "한약/비급여 판매" 칸을 미리 채우는 데 쓴다.
export async function listPurchasesByDate(supabase: SupabaseClient, date: string): Promise<NonCoveredPurchase[]> {
  const { data, error } = await supabase
    .from('non_covered_purchases')
    .select('*')
    .eq('purchase_date', date)
    .order('created_at', { ascending: true });
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
  durationDays: number | null;
  goalCategory: GoalCategory | null;
  createdBy: string | null;
}

// 처방일수가 있으면(한약 수령) 한약 처방 등록과 같은 공식(computeHerbCallDates:
// 수령일+1일 / 수령일+처방일수÷2 / 수령일+처방일수-3)으로 해피콜 3회를 만들고,
// 없으면 기존처럼 한 번만 만든다. 각 콜의 happy_call_manual_entries id를
// non_covered_purchases에 남겨 해피콜 목록/홈 화면에 뜨도록 연결한다.
export async function createNonCoveredPurchase(
  supabase: SupabaseClient,
  input: NewNonCoveredPurchase
): Promise<NonCoveredPurchase> {
  let entryId1: string | null = null;
  let entryId2: string | null = null;
  let entryId3: string | null = null;

  if (input.happyCallDate && input.durationDays) {
    const { callDate1, callDate2, callDate3 } = computeHerbCallDates(input.happyCallDate, input.durationDays);
    entryId1 = await createManualEntry(supabase, {
      patientName: input.patientName,
      note: `${input.productName} 수령 후속 1차`,
      callDate: callDate1,
      createdBy: input.createdBy,
    });
    entryId2 = await createManualEntry(supabase, {
      patientName: input.patientName,
      note: `${input.productName} 수령 후속 2차`,
      callDate: callDate2,
      createdBy: input.createdBy,
    });
    entryId3 = await createManualEntry(supabase, {
      patientName: input.patientName,
      note: `${input.productName} 수령 후속 3차(종료 임박)`,
      callDate: callDate3,
      createdBy: input.createdBy,
    });
  } else if (input.happyCallDate) {
    entryId1 = await createManualEntry(supabase, {
      patientName: input.patientName,
      note: `비급여 구매 후속 - ${input.productName}`,
      // 처방일수가 없어도 1차 해피콜은 수령일 다음날이다(처방일수가 있을 때와 같은 기준).
      callDate: addDays(input.happyCallDate, 1),
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
      happy_call_entry_id: entryId1,
      happy_call_entry_id_2: entryId2,
      happy_call_entry_id_3: entryId3,
      duration_days: input.durationDays,
      goal_category: input.goalCategory,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToPurchase(data as NonCoveredPurchaseRow);
}

export interface EditableNonCoveredPurchase {
  patientName: string;
  chartNo: string;
  phone: string | null;
  category: string;
  productName: string;
  amount: number | null;
  purchaseDate: string;
  memo: string | null;
  goalCategory: GoalCategory | null;
}

export async function updateNonCoveredPurchase(
  supabase: SupabaseClient,
  id: string,
  patch: EditableNonCoveredPurchase
): Promise<void> {
  const { error } = await supabase
    .from('non_covered_purchases')
    .update({
      patient_name: patch.patientName,
      chart_no: patch.chartNo,
      phone: patch.phone,
      category: patch.category,
      product_name: patch.productName,
      amount: patch.amount,
      purchase_date: patch.purchaseDate,
      memo: patch.memo,
      goal_category: patch.goalCategory,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteNonCoveredPurchase(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('non_covered_purchases').delete().eq('id', id);
  if (error) throw error;
}

// 해피콜 예정일만 나중에 고칠 때 — 이미 연결된 happy_call_manual_entries 행도
// 같이 갱신한다(1차 콜 기준).
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
