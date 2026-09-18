import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyRevenue } from '@/lib/types';

// 당일결산 붙여넣기 — 그 날짜의 매출을 그대로 입력(갱신)한다. source='daily'로
// 남겨서, 나중에 월결산이 들어오면 이 값들이 리셋 대상이라는 걸 구분할 수 있다.
export async function upsertDailyRevenue(
  supabase: SupabaseClient,
  date: string,
  totalRevenue: number,
  updatedBy: string | null
): Promise<void> {
  const { error } = await supabase.from('daily_revenue').upsert(
    {
      date,
      total_revenue: totalRevenue,
      source: 'daily',
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'date' }
  );
  if (error) throw error;
}

export async function listRecentDailyRevenue(supabase: SupabaseClient, limit = 14): Promise<DailyRevenue[]> {
  const { data, error } = await supabase
    .from('daily_revenue')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    date: row.date,
    totalRevenue: Number(row.total_revenue),
    source: row.source,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }));
}

export interface MonthlyOverrideRow {
  month: string;
  totalRevenue: number;
  updatedAt: string;
}

export async function listRecentMonthlyOverrides(supabase: SupabaseClient, limit = 6): Promise<MonthlyOverrideRow[]> {
  const { data, error } = await supabase
    .from('monthly_revenue_override')
    .select('month, total_revenue, updated_at')
    .order('month', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    month: row.month,
    totalRevenue: Number(row.total_revenue),
    updatedAt: row.updated_at,
  }));
}

// 월결산 붙여넣기 — 그 달 총매출을 통째로 덮어쓴다("중간 수정 시 리셋"). 다시
// 붙여넣으면 그냥 같은 달 값을 갱신(upsert)하는 것뿐이라 몇 번을 넣어도 안전하다.
export async function upsertMonthlyOverride(
  supabase: SupabaseClient,
  month: string,
  totalRevenue: number,
  updatedBy: string | null
): Promise<void> {
  const { error } = await supabase.from('monthly_revenue_override').upsert(
    {
      month,
      total_revenue: totalRevenue,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'month' }
  );
  if (error) throw error;
}
