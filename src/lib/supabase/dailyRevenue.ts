import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyClosing, DailyRevenue } from '@/lib/types';

// 당일결산 붙여넣기 — 그 날짜의 매출을 그대로 입력(갱신)한다. source='daily'로
// 남겨서, 나중에 월결산이 들어오면 이 값들이 리셋 대상이라는 걸 구분할 수 있다.
export async function upsertDailyRevenue(
  supabase: SupabaseClient,
  input: {
    date: string;
    totalRevenue: number;
    visitCount: number | null;
    closing: DailyClosing;
    updatedBy: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from('daily_revenue').upsert(
    {
      date: input.date,
      total_revenue: input.totalRevenue,
      visit_count: input.visitCount,
      reservation_count: input.closing.reservationCount,
      kept_count: input.closing.keptCount,
      noshow_count: input.closing.noshowCount,
      cancel_count: input.closing.cancelCount,
      next_booking_count: input.closing.nextBookingCount,
      chuna_count: input.closing.chunaCount,
      excluded_count: input.closing.excludedCount,
      source: 'daily',
      updated_by: input.updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'date' }
  );
  if (error) throw error;
}

// 그 날짜에 이미 저장해 둔 일일 결산 숫자 — 같은 날 결산을 다시 열었을 때 그대로 채워 준다.
// 예약 숫자를 한 번도 입력한 적 없으면(reservation_count 없음) null.
export async function getSavedDailyClosing(supabase: SupabaseClient, date: string): Promise<DailyClosing | null> {
  const { data, error } = await supabase
    .from('daily_revenue')
    .select('reservation_count, kept_count, noshow_count, cancel_count, next_booking_count, chuna_count, excluded_count')
    .eq('date', date)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.reservation_count == null) return null;
  const n = (v: unknown) => (v != null ? Number(v) : null);
  return {
    reservationCount: n(data.reservation_count),
    keptCount: n(data.kept_count),
    noshowCount: n(data.noshow_count),
    cancelCount: n(data.cancel_count),
    nextBookingCount: n(data.next_booking_count),
    chunaCount: n(data.chuna_count),
    excludedCount: n(data.excluded_count),
  };
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
    visitCount: row.visit_count != null ? Number(row.visit_count) : null,
    source: row.source,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }));
}

export interface MonthlyOverrideRow {
  month: string;
  totalRevenue: number;
  avgDailyVisits: number | null;
  updatedAt: string;
}

export async function listRecentMonthlyOverrides(supabase: SupabaseClient, limit = 6): Promise<MonthlyOverrideRow[]> {
  const { data, error } = await supabase
    .from('monthly_revenue_override')
    .select('month, total_revenue, avg_daily_visits, updated_at')
    .order('month', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    month: row.month,
    totalRevenue: Number(row.total_revenue),
    avgDailyVisits: row.avg_daily_visits != null ? Number(row.avg_daily_visits) : null,
    updatedAt: row.updated_at,
  }));
}

// 월결산 붙여넣기 — 그 달 총매출을 통째로 덮어쓴다("중간 수정 시 리셋"). 다시
// 붙여넣으면 그냥 같은 달 값을 갱신(upsert)하는 것뿐이라 몇 번을 넣어도 안전하다.
export async function upsertMonthlyOverride(
  supabase: SupabaseClient,
  month: string,
  totalRevenue: number,
  avgDailyVisits: number | null,
  updatedBy: string | null
): Promise<void> {
  const { error } = await supabase.from('monthly_revenue_override').upsert(
    {
      month,
      total_revenue: totalRevenue,
      avg_daily_visits: avgDailyVisits,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'month' }
  );
  if (error) throw error;
}
