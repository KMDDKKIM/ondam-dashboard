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
import { listDoctors } from '@/lib/supabase/doctors';
import { resolveHerbQueueDoctorFilter } from '@/lib/herbQueue';
import { todayKst } from '@/lib/kst';
import { countReservationsByDates } from '@/lib/reservations/dailyRecords.server';
import { getFirstVisitMissing } from '@/lib/reservations/firstVisitMissing.server';
import { getOpenCallCounts } from '@/lib/supabase/happyCallCounts.server';
import { withTimeout } from '@/lib/withTimeout';

// 느린 조회 하나 때문에 홈이 끝없이 기다리지 않게: 이 시간이 지나면 그 항목만 "-"(null)로 보인다.
const LOOKUP_TIMEOUT_MS = 8000;

// 도구 이동은 왼쪽 메뉴가 맡는다. 홈은 "오늘" 화면 — 확인할 것, 이번 달 현황, 오늘의 해피콜과 할 일.
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: staff } = user
    ? await supabase.from('staff').select('role, name').eq('id', user.id).maybeSingle()
    : { data: null };
  const isOwner = staff?.role === 'owner';
  const staffName = staff?.name ?? null;

  // 이번 달 현황과 "오늘 확인할 것" 조회를 순서대로 기다리지 않고 한꺼번에 시작한다(화면이 뜨는 시간이 가장 느린 것 하나로 줄어든다).
  const today = todayKst();
  const [summaryResult, missingClosing, zeroStock, herbTotal, supplyResult, remoteNew, doctorNames, todayReservations, firstVisitMissing, calls] = await Promise.all([
    getMonthlySummary().then(
      (value) => ({ value, error: '' }),
      () => ({ value: undefined, error: '이번달 현황을 불러오지 못했습니다.' })
    ),
    fetchMissingClosingDates(supabase).catch(() => null),
    (async () => {
      try {
        const r = await supabase.from('herb_inventory').select('id', { count: 'exact', head: true }).lte('current_stock', 0);
        return r.error ? null : (r.count ?? 0);
      } catch {
        return null;
      }
    })(),
    (async () => {
      try {
        const r = await supabase.from('herb_inventory').select('id', { count: 'exact', head: true });
        return r.error ? null : (r.count ?? 0);
      } catch {
        return null;
      }
    })(),
    countOpenSupplyRequests(supabase),
    countNewRemoteRequests(supabase),
    listDoctors(supabase)
      .then((doctors) => doctors.map((d) => d.name))
      .catch(() => [] as string[]),
    // 아래 세 가지도 서로 독립이라 하나가 실패해도 그 항목만 "-"(null)로 보인다.
    withTimeout(countReservationsByDates([today]).then((counts) => counts[today] ?? 0), LOOKUP_TIMEOUT_MS),
    withTimeout(getFirstVisitMissing(today), LOOKUP_TIMEOUT_MS),
    withTimeout(getOpenCallCounts(today), LOOKUP_TIMEOUT_MS),
  ]);
  const summary = summaryResult.value;
  const summaryError = summaryResult.error;
  const herbDoctorFilter = resolveHerbQueueDoctorFilter(staffName, doctorNames);
  const herbWaiting = await countWaitingHerbQueue(supabase, herbDoctorFilter);

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

      {/* 한눈에: 위에는 이번 달 현황을 전체 폭으로 가장 크게, 아래에는 같은 높이의 카드 3장(확인할 것 · 해피콜 · 할 일) */}
      <div style={{ marginBottom: 20 }}>
        {summary ? (
          <MonthlyStatsPanel initial={summary} isOwner={isOwner} large />
        ) : (
          <p className="error-text">{summaryError}</p>
        )}
      </div>

      <div className="home-bottom">
        <div>
          <TodayStatus
            missingClosing={missingClosing}
            zeroStockCount={zeroStock}
            supply={supplyResult.error ? null : supplyResult}
            remoteNew={remoteNew}
            herbWaiting={herbWaiting}
            herbWaitingIsMine={herbDoctorFilter !== null}
            herbTotal={herbTotal}
            todayReservations={todayReservations}
            firstVisitMissing={firstVisitMissing}
            calls={calls}
          />
        </div>
        <div>
          <TodayHappyCalls />
        </div>
        <div>
          <TodoChecklist />
        </div>
      </div>
    </div>
  );
}
