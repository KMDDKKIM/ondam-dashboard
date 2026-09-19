import type { SupabaseClient } from '@supabase/supabase-js';
import type { NonCoveredProduct } from '@/lib/types';

interface ProductRow {
  id: string;
  name: string;
  sort_order: number;
}

export async function listNonCoveredProducts(supabase: SupabaseClient): Promise<NonCoveredProduct[]> {
  const { data, error } = await supabase
    .from('non_covered_products')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as ProductRow[]).map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
}

// 새 상품은 목록 맨 뒤에 붙는다.
export async function addNonCoveredProduct(
  supabase: SupabaseClient,
  name: string,
  existing: NonCoveredProduct[]
): Promise<void> {
  const nextOrder = existing.reduce((max, p) => Math.max(max, p.sortOrder), 0) + 1;
  const { error } = await supabase.from('non_covered_products').insert({ name, sort_order: nextOrder });
  if (error) throw error;
}

export async function renameNonCoveredProduct(supabase: SupabaseClient, id: string, name: string): Promise<void> {
  const { data, error } = await supabase.from('non_covered_products').update({ name }).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('수정하지 못했습니다.');
}

export async function deleteNonCoveredProduct(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('non_covered_products').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제하지 못했습니다.');
}
