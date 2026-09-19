import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupplyItem, SupplyRequest } from '@/lib/types';

interface RequestRow {
  id: string;
  category: string;
  item_name: string;
  order_url: string | null;
  memo: string;
  requested_by: string | null;
  requested_at: string;
  ordered_at: string | null;
  ordered_by: string | null;
  received_at: string | null;
  received_by: string | null;
}

interface ItemRow {
  id: string;
  category: string;
  name: string;
  order_url: string | null;
}

function rowToRequest(r: RequestRow): SupplyRequest {
  return {
    id: r.id,
    category: r.category,
    itemName: r.item_name,
    orderUrl: r.order_url,
    memo: r.memo,
    requestedBy: r.requested_by,
    requestedAt: r.requested_at,
    orderedAt: r.ordered_at,
    orderedBy: r.ordered_by,
    receivedAt: r.received_at,
    receivedBy: r.received_by,
  };
}

export async function listSupplyRequests(supabase: SupabaseClient): Promise<SupplyRequest[]> {
  const { data, error } = await supabase
    .from('supply_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data as RequestRow[]).map(rowToRequest);
}

export async function listSupplyItems(supabase: SupabaseClient): Promise<SupplyItem[]> {
  const { data, error } = await supabase
    .from('supply_items')
    .select('id, category, name, order_url')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as ItemRow[]).map((r) => ({ id: r.id, category: r.category, name: r.name, orderUrl: r.order_url }));
}

export interface NewSupplyRequest {
  category: string;
  itemName: string;
  orderUrl: string;
  memo: string;
  requestedBy: string | null;
  saveAsItem: boolean;
}

export async function createSupplyRequest(supabase: SupabaseClient, input: NewSupplyRequest): Promise<void> {
  const orderUrl = input.orderUrl.trim() || null;
  const { error } = await supabase.from('supply_requests').insert({
    category: input.category,
    item_name: input.itemName,
    order_url: orderUrl,
    memo: input.memo,
    requested_by: input.requestedBy,
  });
  if (error) throw error;

  if (input.saveAsItem) {
    // 이미 있는 품목이면 링크만 새 값으로 갱신한다(unique(category, name)).
    const { error: itemError } = await supabase
      .from('supply_items')
      .upsert({ category: input.category, name: input.itemName, order_url: orderUrl }, { onConflict: 'category,name' });
    if (itemError) throw itemError;
  }
}

export async function setSupplyOrdered(
  supabase: SupabaseClient,
  id: string,
  ordered: boolean,
  staffId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('supply_requests')
    .update({
      ordered_at: ordered ? new Date().toISOString() : null,
      ordered_by: ordered ? staffId : null,
      // 주문을 취소하면 도착 표시도 함께 지운다(주문 전에 도착할 수는 없다).
      ...(ordered ? {} : { received_at: null, received_by: null }),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function setSupplyReceived(
  supabase: SupabaseClient,
  id: string,
  received: boolean,
  staffId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('supply_requests')
    .update({
      received_at: received ? new Date().toISOString() : null,
      received_by: received ? staffId : null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteSupplyRequest(supabase: SupabaseClient, id: string): Promise<void> {
  // RLS가 막으면(권한 없음) 에러 없이 0행이 지워지므로 실제 삭제됐는지 확인한다.
  const { data, error } = await supabase.from('supply_requests').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제 권한이 없습니다.');
}
