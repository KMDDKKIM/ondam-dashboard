import { ReservationsApp } from '@/components/reservations/ReservationsApp';
import { createClient } from '@/lib/supabase/server';
import { getMonthlySummary, getWeeklyRates } from '@/lib/monthlySummary';
import './reservations.css';

export default async function ReservationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staff } = user
    ? await supabase.from('staff').select('role').eq('id', user.id).maybeSingle()
    : { data: null };

  const [summary, rates] = await Promise.all([getMonthlySummary(), getWeeklyRates()]);

  return <ReservationsApp summary={summary} rates={rates} isOwner={staff?.role === 'owner'} />;
}
