import type { SupabaseClient } from '@supabase/supabase-js';

// 왼쪽 메뉴 배지용 — 승인을 기다리는 직원 가입 신청 수(원장님에게만 보인다). 못 읽으면 null(배지를 숨긴다).
export async function countPendingStaff(supabase: SupabaseClient): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}
