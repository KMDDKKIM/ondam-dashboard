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
      // 단위는 봉지 하나뿐이다(컬럼이 not null이라 명시).
      unit: '봉지',
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

export interface HerbStockChange {
  herbId: string;
  /** 오류 문구에 약재 이름이 나오도록 함께 보낸다(DB 함수는 herb_id 로 찾고, 이름은 문구에만 쓴다). */
  name?: string;
  changeType: 'use' | 'restock';
  amount: number; // 1 이상의 정수(봉지)
  note?: string | null;
}

export interface HerbStockResult {
  herbId: string;
  name: string;
  currentStock: number;
}

// 입고/사용을 DB 함수 한 번으로 처리한다. 여러 약재도 한 트랜잭션이라, 하나라도 안 되면
// (재고가 모자라거나 목록에 없는 약재) 전부 반영되지 않는다 — 그래서 다시 시도해도 이중 반영이 없다.
// 이력(herb_inventory_logs)도 함수 안에서 같이 남는다.
export async function applyHerbStockChanges(
  supabase: SupabaseClient,
  changes: HerbStockChange[]
): Promise<HerbStockResult[]> {
  const { data, error } = await supabase.rpc('apply_herb_stock_changes', {
    p_changes: changes.map((c) => ({
      herb_id: c.herbId,
      name: c.name,
      change_type: c.changeType,
      amount: c.amount,
      note: c.note ?? null,
    })),
  });
  if (error) throw error;
  return (data as { herb_id: string; name: string; current_stock: number }[]).map((r) => ({
    herbId: r.herb_id,
    name: r.name,
    currentStock: Number(r.current_stock),
  }));
}

/** DB 함수가 직접 던진 오류(P0001)는 한국어 안내 문구라 그대로 보여주고, 나머지는 일반 문구로. */
export function stockErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: unknown; message?: unknown };
    if (e.code === 'P0001' && typeof e.message === 'string') return e.message;
    if (e.code === 'PGRST202' || e.code === '42883') {
      return '재고 처리 함수가 아직 설치되지 않았어요(관리자 문의).';
    }
  }
  return '재고 처리에 실패했습니다. 잠시 후 다시 시도해주세요.';
}

// 부족 기준(봉지). null이면 기준 없음. RLS가 막으면 에러 없이 0행이 바뀌므로 확인한다.
export async function setHerbLowStockThreshold(
  supabase: SupabaseClient,
  id: string,
  threshold: number | null
): Promise<void> {
  const { data, error } = await supabase
    .from('herb_inventory')
    .update({ low_stock_threshold: threshold, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('저장하지 못했습니다.');
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

export async function listRecentHerbInventoryLogs(
  supabase: SupabaseClient,
  limit = 50
): Promise<HerbInventoryLog[]> {
  const { data, error } = await supabase
    .from('herb_inventory_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
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

// 이력의 처리자 이름을 보여주기 위한 직원 id -> 이름. 퇴사로 삭제된 직원은 없다.
export async function listStaffNames(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('staff').select('id, name');
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const row of data as { id: string; name: string }[]) map[row.id] = row.name;
  return map;
}
