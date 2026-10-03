import type { SupabaseClient } from '@supabase/supabase-js';
import type { VisitHistoryRow } from '@/lib/visitHistoryImport';

const CHUNK = 200;

// 가져온 내원 이력을 차트번호 기준으로 넣는다(이미 있는 차트번호는 새 값으로 덮어쓴다).
export async function upsertVisitHistory(
  supabase: SupabaseClient,
  rows: VisitHistoryRow[],
  period: { start: string | null; end: string | null }
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const payload = rows.slice(i, i + CHUNK).map((r) => ({
      chart_no: r.chartNo,
      patient_name: r.patientName,
      phone: r.phone,
      registered_date: r.registeredDate,
      first_visit: r.firstVisit,
      last_visit: r.lastVisit,
      visit_days: r.visitDays,
      inflow: r.inflow,
      period_start: period.start,
      period_end: period.end,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('patient_visit_history').upsert(payload, { onConflict: 'chart_no' });
    if (error) throw error;
  }
}

export interface VisitHistorySummary {
  count: number;
  periodStart: string | null;
  periodEnd: string | null;
}

export async function getVisitHistorySummary(supabase: SupabaseClient): Promise<VisitHistorySummary> {
  const { count, error } = await supabase.from('patient_visit_history').select('chart_no', { count: 'exact', head: true });
  if (error) throw error;
  const start = await supabase.from('patient_visit_history').select('period_start').not('period_start', 'is', null).order('period_start', { ascending: true }).limit(1);
  const end = await supabase.from('patient_visit_history').select('period_end').not('period_end', 'is', null).order('period_end', { ascending: false }).limit(1);
  return {
    count: count ?? 0,
    periodStart: (start.data?.[0] as { period_start: string } | undefined)?.period_start ?? null,
    periodEnd: (end.data?.[0] as { period_end: string } | undefined)?.period_end ?? null,
  };
}
