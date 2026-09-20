import { ReservationsApp } from '@/components/reservations/ReservationsApp';
import { createClient } from '@/lib/supabase/server';
import { getMonthlySummary, getWeeklyRates } from '@/lib/monthlySummary';
import { fetchMissingClosingDates } from '@/lib/supabase/dailyRevenue';
import './reservations.css';

export default async function ReservationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staff } = user
    ? await supabase.from('staff').select('role').eq('id', user.id).maybeSingle()
    : { data: null };

  const [summary, rates, missingClosing] = await Promise.all([
    // 이번달 현황을 못 구해도(예: DB 변경이 아직 적용 전) 예약 화면은 떠야 한다 — 홈과 같은 방식.
    getMonthlySummary().catch(() => null),
    getWeeklyRates(),
    // 알림을 못 구해도 화면은 떠야 한다.
    fetchMissingClosingDates(supabase).catch(() => [] as string[]),
  ]);

  return (
    <ReservationsApp
      summary={summary}
      rates={rates}
      isOwner={staff?.role === 'owner'}
      missingClosingDates={missingClosing}
    />
  );
}
