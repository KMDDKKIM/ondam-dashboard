import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysKst } from '@/lib/kst';
import type { HappyCallRules } from '@/lib/happyCallRules';
import { listDietPrograms, syncDeskCalls } from './dietPrograms';
import { setPickupDate } from './herbPickup';
import { markRulesApplied } from './happyCallRules';
import { reapplyPurchaseCalls } from './nonCoveredPurchases';

// 해피콜 규칙을 바꾼 뒤 "이미 잡아 둔 해피콜"도 새 규칙에 맞추는 일. 이미 끝났거나 전화를 시도한 해피콜은 건드리지 않고
// (기록과 재시도 일정을 지키기 위해서), 날짜가 이미 지난 해피콜을 새로 만들거나 지난 날짜로 옮기지도 않는다.
// 호출하기 전에 규칙을 먼저 저장해 두어야 한다(처방전·린다이어트 쪽은 저장된 규칙을 읽는다).

/** 수령예정일이 이 일수 안인 처방전만 다시 맞춘다(약은 길어야 몇 달이라 그보다 오래된 처방전의 해피콜은 이미 끝났다). */
const HERB_ORDER_LOOKBACK_DAYS = 200;

export interface ApplyResult {
  purchases: { checked: number; moved: number; created: number; removed: number };
  herbOrders: { checked: number; failed: number };
  dietPrograms: { checked: number; failed: number };
}

export async function applyRulesToOpenCalls(supabase: SupabaseClient, rules: HappyCallRules, today: string, by: string | null): Promise<ApplyResult> {
  const purchases = await reapplyPurchaseCalls(supabase, rules.special, today);

  const result: ApplyResult = { purchases, herbOrders: { checked: 0, failed: 0 }, dietPrograms: { checked: 0, failed: 0 } };

  const { data: orders, error } = await supabase
    .from('herb_compounding_orders')
    .select('id, pickup_date')
    .not('pickup_date', 'is', null)
    .gte('pickup_date', addDaysKst(today, -HERB_ORDER_LOOKBACK_DAYS))
    .limit(2000);
  if (error) throw error;
  for (const o of (orders ?? []) as { id: string; pickup_date: string }[]) {
    result.herbOrders.checked += 1;
    try {
      await setPickupDate(supabase, o.id, o.pickup_date, by, { notBefore: today });
    } catch {
      result.herbOrders.failed += 1;
    }
  }

  const programs = (await listDietPrograms(supabase)).filter((p) => p.status === 'active');
  for (const p of programs) {
    result.dietPrograms.checked += 1;
    try {
      await syncDeskCalls(supabase, p, by, today);
    } catch {
      result.dietPrograms.failed += 1;
    }
  }

  await markRulesApplied(supabase);
  return result;
}
