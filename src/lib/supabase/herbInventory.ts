import type { SupabaseClient } from '@supabase/supabase-js';
import type { HerbInventoryItem, HerbInventoryLog } from '@/lib/types';

interface HerbInventoryRow {
  id: string;
  name: string;
  current_stock: number;
  low_stock_threshold: number | null;
  updated_at: string;
}

function rowToItem(row: HerbInventoryRow): HerbInventoryItem {
  return {
    id: row.id,
    name: row.name,
    currentStock: Number(row.current_stock),
    lowStockThreshold: row.low_stock_threshold != null ? Number(row.low_stock_threshold) : null,
    updatedAt: row.updated_at,
  };
}

export async function listHerbInventory(supabase: SupabaseClient): Promise<HerbInventoryItem[]> {
  const { data, error } = await supabase.from('herb_inventory').select('*').order('name');
  if (error) throw error;
  return (data as HerbInventoryRow[]).map(rowToItem);
}

// 여러 약재를 한 번의 insert로 넣는다 — 하나라도 실패하면 전부 들어가지 않는다.
export async function createHerbInventoryItems(
  supabase: SupabaseClient,
  inputs: { name: string; currentStock: number; createdBy: string | null }[]
): Promise<void> {
  const { error } = await supabase.from('herb_inventory').insert(
    inputs.map((i) => ({
      name: i.name,
      // 단위는 이제 화면에 안 쓰지만 컬럼이 not null이라 빈 값으로 채운다.
      unit: '',
      current_stock: i.currentStock,
      created_by: i.createdBy,
    }))
  );
  if (error) throw error;
}

// RLS가 막으면 에러 없이 0행이 지워지므로 실제로 지워졌는지 확인한다.
export async function deleteHerbInventoryItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('herb_inventory').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제하지 못했습니다.');
}

// 사용(use)은 재고를 줄이고, 입고(restock)는 늘린다. 두 종류 모두 herb_inventory의
// current_stock을 바로 갱신하면서, herb_inventory_logs에 변동 이력을 같이 남긴다.
// 한 번의 사용자 조작이 두 테이블에 걸쳐 있으므로, 두 번째 쓰기가 실패하면 첫 번째
// 갱신도 되돌려 재고 숫자와 이력이 어긋나지 않게 한다.
export async function adjustHerbStock(
  supabase: SupabaseClient,
  input: {
    herbId: string;
    changeType: 'use' | 'restock';
    amount: number;
    note: string | null;
    createdBy: string | null;
    currentStock: number;
  }
): Promise<number> {
  const delta = input.changeType === 'use' ? -input.amount : input.amount;
  const nextStock = Math.max(0, input.currentStock + delta);

  const { error: updateError } = await supabase
    .from('herb_inventory')
    .update({ current_stock: nextStock, updated_at: new Date().toISOString() })
    .eq('id', input.herbId);
  if (updateError) throw updateError;

  const { error: logError } = await supabase.from('herb_inventory_logs').insert({
    herb_id: input.herbId,
    change_type: input.changeType,
    amount: input.amount,
    note: input.note,
    created_by: input.createdBy,
  });
  if (logError) {
    await supabase
      .from('herb_inventory')
      .update({ current_stock: input.currentStock })
      .eq('id', input.herbId);
    throw logError;
  }

  return nextStock;
}

interface HerbInventoryLogRow {
  id: string;
  herb_id: string;
  change_type: 'use' | 'restock';
  amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export async function listHerbInventoryLogs(
  supabase: SupabaseClient,
  herbId: string
): Promise<HerbInventoryLog[]> {
  const { data, error } = await supabase
    .from('herb_inventory_logs')
    .select('*')
    .eq('herb_id', herbId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data as HerbInventoryLogRow[]).map((row) => ({
    id: row.id,
    herbId: row.herb_id,
    changeType: row.change_type,
    amount: Number(row.amount),
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}
