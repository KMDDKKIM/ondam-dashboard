import type { SupabaseClient } from '@supabase/supabase-js';
import type { HerbOrderMemo } from '@/lib/types';

interface Row {
  text: string;
  updated_by: string | null;
  updated_at: string;
}

// "부족한 약재" 칸에 붙는 발주 메모 한 장(싱글턴 행, id는 항상 true). 표를 새로 만들지 않고
// 직원 전체가 같이 보고 고치는 텍스트 한 줄만 둔다 — 마지막에 저장한 사람 것으로 덮어써진다.
export async function getHerbOrderMemo(supabase: SupabaseClient): Promise<HerbOrderMemo> {
  const { data, error } = await supabase
    .from('herb_order_memo')
    .select('text, updated_by, updated_at')
    .eq('id', true)
    .maybeSingle();
  if (error) throw error;
  const row = data as Row | null;
  return row
    ? { text: row.text, updatedBy: row.updated_by, updatedAt: row.updated_at }
    : { text: '', updatedBy: null, updatedAt: new Date(0).toISOString() };
}

export async function saveHerbOrderMemo(supabase: SupabaseClient, text: string, updatedBy: string | null): Promise<void> {
  const { error } = await supabase
    .from('herb_order_memo')
    .update({ text, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq('id', true);
  if (error) throw error;
}
