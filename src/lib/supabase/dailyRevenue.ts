import type { SupabaseClient } from '@supabase/supabase-js';

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

// 월결산 붙여넣기 — 해당 월의 기존 daily_revenue 행을 전부 지우고, 붙여넣은
// 표의 날짜별 매출로 다시 채운다("중간 수정 시 리셋").
export async function resetMonthRevenue(
  supabase: SupabaseClient,
  month: string,
  rows: { date: string; totalRevenue: number }[],
  updatedBy: string | null
): Promise<void> {
  const monthStart = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const next = new Date(y, m, 1);
  const monthEnd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;

  const { error: deleteError } = await supabase
    .from('daily_revenue')
    .delete()
    .gte('date', monthStart)
    .lt('date', monthEnd);
  if (deleteError) throw deleteError;

  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from('daily_revenue').insert(
    rows.map((r) => ({
      date: r.date,
      total_revenue: r.totalRevenue,
      source: 'monthly' as const,
      updated_by: updatedBy,
    }))
  );
  if (insertError) throw insertError;
}
