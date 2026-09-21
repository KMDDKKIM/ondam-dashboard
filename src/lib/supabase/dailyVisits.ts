import type { SupabaseClient } from '@supabase/supabase-js';
import type { SettlementVisit } from '@/lib/settlementVisits';

const CHUNK = 200;

// 그날의 내원 환자 명단을 통째로 바꾼다 — 같은 날 결산을 다시 붙여넣어도 중복이 쌓이지 않도록 먼저 그 날짜를 지우고 넣는다.
// (지우기와 넣기 사이에 실패하면 그 날짜 명단이 비므로, 실패하면 화면에서 "다시 저장"을 안내한다.)
export async function replaceDailyVisits(
  supabase: SupabaseClient,
  date: string,
  visits: SettlementVisit[],
  createdBy: string | null
): Promise<void> {
  const { error: deleteError } = await supabase.from('daily_visits').delete().eq('visit_date', date);
  if (deleteError) throw deleteError;
  for (let i = 0; i < visits.length; i += CHUNK) {
    const rows = visits.slice(i, i + CHUNK).map((v) => ({
      visit_date: date,
      chart_no: v.chartNo,
      patient_name: v.patientName,
      doctor_name: v.doctorName,
      total_fee: v.totalFee,
      patient_pay: v.patientPay,
      coverage: v.coverage || null,
      unpaid: v.unpaid,
      cash_pay: v.cashPay,
      card_pay: v.cardPay,
      created_by: createdBy,
    }));
    const { error } = await supabase.from('daily_visits').insert(rows);
    if (error) throw error;
  }
}

/** 그 날짜에 저장된 내원 환자 수(저장 전 안내용). */
export async function countDailyVisits(supabase: SupabaseClient, date: string): Promise<number> {
  const { count, error } = await supabase.from('daily_visits').select('id', { count: 'exact', head: true }).eq('visit_date', date);
  if (error) throw error;
  return count ?? 0;
}
