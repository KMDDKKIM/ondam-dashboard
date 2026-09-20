import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { OpenSupplyCounts } from '@/lib/supplyHelpers';

export interface OpenSupplyCountsResult extends OpenSupplyCounts {
  /** 조회에 실패하면 true(이때 건수는 0). 홈에서는 "-"로 보여줄 수 있다. */
  error?: true;
}

// 홈 요약용: 주문 대기(신청됨) / 도착 대기(주문완료) 건수. 서버 컴포넌트에서 호출한다.
// 테이블이 없거나 조회가 실패해도 홈이 깨지지 않도록 0건 + error 로 돌려준다.
export async function countOpenSupplyRequests(client?: SupabaseClient): Promise<OpenSupplyCountsResult> {
  const failed: OpenSupplyCountsResult = { waitingOrder: 0, waitingArrival: 0, error: true };
  try {
    const supabase = client ?? (await createClient());
    const [waitingOrder, waitingArrival] = await Promise.all([
      supabase
        .from('supply_requests')
        .select('id', { count: 'exact', head: true })
        .is('ordered_at', null)
        .is('received_at', null),
      supabase
        .from('supply_requests')
        .select('id', { count: 'exact', head: true })
        .not('ordered_at', 'is', null)
        .is('received_at', null),
    ]);
    if (waitingOrder.error || waitingArrival.error) return failed;
    return { waitingOrder: waitingOrder.count ?? 0, waitingArrival: waitingArrival.count ?? 0 };
  } catch {
    return failed;
  }
}
