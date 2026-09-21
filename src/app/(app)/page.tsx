import { QuoteBanner } from '@/components/QuoteBanner';
import { TodoChecklist } from '@/components/TodoChecklist';
import { TodayHappyCalls } from '@/components/TodayHappyCalls';
import { TodayStatus } from '@/components/TodayStatus';
import { MonthlyStatsPanel } from '@/components/MonthlyStatsPanel';
import { createClient } from '@/lib/supabase/server';
import { getMonthlySummary } from '@/lib/monthlySummary';
import { fetchMissingClosingDates } from '@/lib/supabase/dailyRevenue';
import { countOpenSupplyRequests } from '@/lib/supabase/supplyCounts';
import { countNewRemoteRequests } from '@/lib/supabase/remoteConsult';
import { countWaitingHerbQueue } from '@/lib/supabase/herbQueue';

// 도구 이동은 왼쪽 메뉴가 맡는다. 홈은 "오늘" 화면 — 확인할 것, 이번 달 현황, 오늘의 해피콜과 할 일.
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staff } = user
    ? await supabase.from('staff').select('role').eq('id', user.id).maybeSingle()
    : { data: null };
  const isOwner = staff?.role === 'owner';

  let summary;
  let summaryError = '';
  try {
    summary = await getMonthlySummary();
  } catch {
    summaryError = '이번달 현황을 불러오지 못했습니다.';
  }

  const [missingClosing, zeroStock, supplyResult, remoteNew, herbWaiting] = await Promise.all([
    fetchMissingClosingDates(supabase).catch(() => null),
    (async () => {
      try {
        const r = await supabase.from('herb_inventory').select('id', { count: 'exact', head: true }).lte('current_stock', 0);
        return r.error ? null : (r.count ?? 0);
      } catch {
        return null;
      }
    })(),
    countOpenSupplyRequests(supabase),
    countNewRemoteRequests(supabase),
    countWaitingHerbQueue(supabase),
  ]);

  const todayLabel = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <h1 style={{ fontSize: 26, lineHeight: 1.1 }}>오늘</h1>
        <span className="muted-text" style={{ fontSize: 14, fontWeight: 600 }}>
          {todayLabel}
        </span>
      </div>

      <QuoteBanner />

      <TodayStatus
        missingClosing={missingClosing}
        zeroStockCount={zeroStock}
        supply={supplyResult.error ? null : supplyResult}
        remoteNew={remoteNew}
        herbWaiting={herbWaiting}
      />

      {summary ? (
        <MonthlyStatsPanel initial={summary} isOwner={isOwner} />
      ) : (
        <p className="error-text" style={{ marginBottom: 20 }}>
          {summaryError}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, alignItems: 'start' }}>
        <TodayHappyCalls />
        <TodoChecklist />
      </div>
    </div>
  );
}
