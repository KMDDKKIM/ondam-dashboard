import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoalCategory, NonCoveredPurchase } from '@/lib/types';
import {
  createManualEntry,
  getManualEntryStates,
  removeOpenManualEntries,
  renameOpenManualEntries,
  updateUntouchedManualEntry,
} from './happyCallQueue';
import { addDays } from '@/lib/happyCallStats';
import { CALL_SLOTS, callTypeForPurchase, desiredCalls, planCallResync, type CallSlot, type ExistingCall } from '@/lib/nonCoveredCalls';

const TABLE = 'non_covered_purchases';

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

const PAGE_SIZE = 1000; // Supabase(PostgREST) 한 번에 돌려주는 최대 행 수

// 전체 구매를 1000건씩 이어서 끝까지 읽는다(limit 로 자르면 오래된 기록이 조용히 빠진다).
// 정렬 키가 겹치지 않도록 id 까지 정렬해 페이지 사이에 행이 겹치거나 빠지지 않게 한다.
export async function listNonCoveredPurchases(supabase: SupabaseClient): Promise<NonCoveredPurchase[]> {
  const rows: NonCoveredPurchaseRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as NonCoveredPurchaseRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows.map(rowToPurchase);
}

// 그 날짜에 등록된 구매만 — 일일 마무리 멘트의 "한약/비급여 판매" 칸을 미리 채우는 데 쓴다.
export async function listPurchasesByDate(supabase: SupabaseClient, date: string): Promise<NonCoveredPurchase[]> {
  const { data, error } = await supabase
    .from(TABLE)
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

/** 구매 기록 자체는 처리됐지만 딸린 해피콜을 만들거나 맞추거나 지우는 데 문제가 생겼을 때. message 는 화면에 그대로 보여 준다. */
export class HappyCallSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HappyCallSyncError';
  }
}

function slotIds(purchase: Pick<NonCoveredPurchase, 'happyCallEntryId' | 'happyCallEntryId2' | 'happyCallEntryId3'>) {
  return {
    1: purchase.happyCallEntryId,
    2: purchase.happyCallEntryId2,
    3: purchase.happyCallEntryId3,
  } satisfies Record<CallSlot, string | null>;
}

// 구매를 먼저 저장한 뒤 해피콜을 만들고 그 id를 구매에 연결한다. 처방일수가 있으면(한약 수령)
// 한약 처방 등록과 같은 공식(수령일+1일 / 수령일+처방일수÷2 / 수령일+처방일수-3)으로 3회,
// 수령일만 있으면 다음날 1회(src/lib/nonCoveredCalls.ts). 해피콜을 만들다 실패하면 구매와 이미 만든
// 콜을 되돌린다(최선을 다해 — 되돌리기도 실패할 수 있어 그 경우 메시지로 알린다).
export async function createNonCoveredPurchase(
  supabase: SupabaseClient,
  input: NewNonCoveredPurchase
): Promise<NonCoveredPurchase> {
  const { data, error } = await supabase
    .from(TABLE)
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
      duration_days: input.durationDays,
      goal_category: input.goalCategory,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  const purchase = rowToPurchase(data as NonCoveredPurchaseRow);

  const calls = desiredCalls(input.productName, input.happyCallDate, input.durationDays);
  if (calls.length === 0) return purchase;

  const createdIds: string[] = [];
  try {
    const linked: Partial<Record<CallSlot, string>> = {};
    for (const call of calls) {
      const id = await createManualEntry(supabase, {
        patientName: input.patientName,
        note: call.note,
        callDate: call.callDate,
        createdBy: input.createdBy,
        callType: callTypeForPurchase(input.productName, input.durationDays),
        phone: input.phone,
      });
      createdIds.push(id);
      linked[call.slot] = id;
    }
    const { error: linkError } = await supabase
      .from(TABLE)
      .update({
        happy_call_entry_id: linked[1] ?? null,
        happy_call_entry_id_2: linked[2] ?? null,
        happy_call_entry_id_3: linked[3] ?? null,
      })
      .eq('id', purchase.id);
    if (linkError) throw linkError;
    return {
      ...purchase,
      happyCallEntryId: linked[1] ?? null,
      happyCallEntryId2: linked[2] ?? null,
      happyCallEntryId3: linked[3] ?? null,
    };
  } catch {
    // 구매를 먼저 지워야(콜을 가리키는 연결이 없어야) 콜을 지울 수 있다.
    let purchaseRemoved = false;
    try {
      const { error: deleteError } = await supabase.from(TABLE).delete().eq('id', purchase.id);
      purchaseRemoved = !deleteError;
    } catch {
      purchaseRemoved = false;
    }
    await removeOpenManualEntries(supabase, createdIds).catch(() => {});
    throw new HappyCallSyncError(
      purchaseRemoved
        ? '해피콜을 만들지 못해 등록을 취소했어요. 다시 시도해 주세요.'
        : '해피콜을 만들지 못했어요. 구매 기록이 남아 있을 수 있으니 목록을 확인해 주세요.'
    );
  }
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
  /** 한약 수령일(해피콜 기준일) */
  happyCallDate: string | null;
  durationDays: number | null;
}

// 구매를 고치고, 수령일/처방일수/상품명에 맞게 해피콜을 다시 맞춘다(planCallResync):
// 이미 끝났거나 이미 전화를 시도한 콜은 그대로 두고, 아직 손대지 않은 콜만 날짜를 옮기거나
// 새로 만들거나 지운다. 새 콜을 먼저 만들고 → 구매를 저장(콜 연결 갱신) → 기존 콜을 옮기고/지운다
// 순서라, 도중에 실패해도 콜이 사라진 채 구매만 남는 일이 없다.
export async function updateNonCoveredPurchase(
  supabase: SupabaseClient,
  existing: NonCoveredPurchase,
  patch: EditableNonCoveredPurchase
): Promise<void> {
  const current = slotIds(existing);
  const linked = CALL_SLOTS.flatMap((slot) => (current[slot] ? [{ slot, id: current[slot] as string }] : []));
  const states = await getManualEntryStates(
    supabase,
    linked.map((l) => l.id)
  );
  const existingCalls: ExistingCall[] = linked.flatMap(({ slot, id }) => {
    const state = states.find((s) => s.id === id);
    return state ? [{ slot, ...state }] : [];
  });
  const ops = planCallResync(desiredCalls(patch.productName, patch.happyCallDate, patch.durationDays), existingCalls);

  const nextIds: Record<CallSlot, string | null> = { ...current };
  const createdIds: string[] = [];
  try {
    for (const op of ops) {
      if (op.type !== 'create') continue;
      const id = await createManualEntry(supabase, {
        patientName: patch.patientName,
        note: op.note,
        callDate: op.callDate,
        createdBy: existing.createdBy,
        callType: callTypeForPurchase(patch.productName, patch.durationDays),
        phone: patch.phone,
      });
      createdIds.push(id);
      nextIds[op.slot] = id;
    }
    for (const op of ops) {
      if (op.type === 'remove') nextIds[op.slot] = null;
    }
    const { error } = await supabase
      .from(TABLE)
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
        happy_call_date: patch.happyCallDate,
        duration_days: patch.durationDays,
        happy_call_entry_id: nextIds[1],
        happy_call_entry_id_2: nextIds[2],
        happy_call_entry_id_3: nextIds[3],
      })
      .eq('id', existing.id);
    if (error) throw error;
  } catch (err) {
    await removeOpenManualEntries(supabase, createdIds).catch(() => {});
    throw err;
  }

  try {
    for (const op of ops) {
      if (op.type === 'update') {
        await updateUntouchedManualEntry(supabase, op.id, { callDate: op.callDate, note: op.note });
      }
    }
    await removeOpenManualEntries(
      supabase,
      ops.flatMap((op) => (op.type === 'remove' ? [op.id] : [])),
      { onlyUntouched: true }
    );
    // 환자 이름을 고쳤으면 아직 열린 기존 콜(이미 시도한 콜 포함)에도 새 이름을 반영한다. 끝난 콜은 그대로 둔다.
    if (patch.patientName !== existing.patientName) {
      await renameOpenManualEntries(
        supabase,
        CALL_SLOTS.flatMap((slot) => (nextIds[slot] && !createdIds.includes(nextIds[slot] as string) ? [nextIds[slot] as string] : [])),
        patch.patientName
      );
    }
  } catch {
    throw new HappyCallSyncError('구매 기록은 저장했지만 해피콜 일정을 다 맞추지 못했어요. 해피콜 목록을 확인해 주세요.');
  }
}

// 구매를 지우고, 그 구매로 자동 생성된 해피콜 중 아직 열려 있는 것도 함께 지운다
// (이미 끝난 콜은 통화 기록이라 남긴다). 구매를 먼저 지워야 콜을 지울 수 있다(콜을 가리키는 연결).
export async function deleteNonCoveredPurchase(supabase: SupabaseClient, purchase: NonCoveredPurchase): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', purchase.id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제하지 못했습니다.');

  const ids = Object.values(slotIds(purchase)).filter((id): id is string => Boolean(id));
  try {
    await removeOpenManualEntries(supabase, ids);
  } catch {
    throw new HappyCallSyncError('기록은 삭제했지만 예정된 해피콜을 다 지우지 못했어요. 해피콜 목록을 확인해 주세요.');
  }
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
