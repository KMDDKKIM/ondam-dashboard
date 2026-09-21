import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeMonthFigures, revenueMotivation, type DailyFigure, type MonthlyOverrideFigure } from '@/lib/monthlyFigures';
import { addDaysKst, currentMonthKst, todayKst } from '@/lib/kst';
import { computeReservationRates } from '@/lib/reservationRates';

export interface MonthlySummary {
  month: string;
  avgDailyVisits: number | null;
  totalRevenue: number | null;
  // 객단가 = 총진료비 ÷ 총 내원 인원(원). 내원 인원을 모르거나 0이면 null(화면에서 숨김).
  averageTicket: number | null;
  // 월말결산 값은 있는데 기준일이 없어 일일 마감이 합산되지 않는 옛 행이면 true(화면에 경고).
  legacyOverride: boolean;
  // 총매출 아래에 보여줄 동기부여 문구(목표 달성 여부 + 문구 목록). 항상 모든 직원에게 보인다.
  motivation: { reached: boolean; lines: string[] };
  // 총매출 / 일평균 환자수 목표(대표원장이 입력). 없으면 null.
  totalRevenueGoal: number | null;
  avgDailyVisitsGoal: number | null;
  goals: {
    // adjust: 자동 집계가 틀렸을 때 대표원장이 손으로 더하거나 뺀 값(achieved에 이미 반영됨).
    herb: { achieved: number; goal: number | null; adjust: number };
    diet: { achieved: number; goal: number | null; adjust: number };
    specialHerb: { achieved: number; goal: number | null; adjust: number };
    chuna: { achieved: number; goal: number | null; adjust: number };
  };
}

interface DailyRecordRow {
  date: string;
  visit_count: number | null;
  nogyong_count: number | null;
  ilban_count: number | null;
  chuna_count: number | null;
  diet_count: number | null;
}

// 서버 시간대와 상관없이 한국 기준 이번 달.
function currentMonth(): string {
  return currentMonthKst();
}

function previousMonthOf(month: string): string {
  return addDaysKst(`${month}-01`, -1).slice(0, 7);
}

function monthRange(month: string): { monthStart: string; monthEnd: string } {
  const [y, m] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const next = new Date(y, m, 1);
  const monthEnd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  return { monthStart, monthEnd };
}

// 그 달 일일결산(날짜별)과 월말결산(있으면)을 읽어 computeMonthFigures 입력 모양으로 돌려준다.
async function loadMonthFigures(
  admin: ReturnType<typeof createAdminClient>,
  month: string,
  revenueRows: { date: string; total_revenue: unknown; visit_count: unknown }[]
): Promise<{ daily: DailyFigure[]; override: MonthlyOverrideFigure | null }> {
  const { data: overrideRow, error } = await admin
    .from('monthly_revenue_override')
    .select('total_revenue, avg_daily_visits, as_of_date')
    .eq('month', month)
    .maybeSingle();
  if (error) throw error;
  return {
    daily: revenueRows.map((r) => ({
      date: r.date,
      totalRevenue: Number(r.total_revenue) || 0,
      visitCount: r.visit_count != null ? Number(r.visit_count) : null,
    })),
    override: overrideRow
      ? {
          totalRevenue: Number(overrideRow.total_revenue),
          avgDailyVisits: overrideRow.avg_daily_visits != null ? Number(overrideRow.avg_daily_visits) : null,
          asOfDate: overrideRow.as_of_date ?? null,
        }
      : null,
  };
}

// 예약관리 앱(kh-ondam-reservation)의 daily_records/monthly_goals를 읽는다.
// 같은 hanyak-ondam Supabase 프로젝트를 공유하지만 그쪽 RLS는 anon/authenticated를
// 전부 막고 service_role로만 열어두는 구조라(그 저장소의 schema.sql 참고),
// 여기서도 admin(service_role) 클라이언트로만 접근한다. 매출(daily_revenue)은 이
// 앱 자신의 테이블이지만 같은 admin 클라이언트로 같이 읽어도 문제없다.
export async function getMonthlySummary(month: string = currentMonth()): Promise<MonthlySummary> {
  const admin = createAdminClient();
  const { monthStart, monthEnd } = monthRange(month);

  const { data: records, error: recordsError } = await admin
    .from('daily_records')
    .select('date, visit_count, nogyong_count, ilban_count, chuna_count, diet_count')
    .is('deleted_at', null)
    .gte('date', monthStart)
    .lt('date', monthEnd);
  if (recordsError) throw recordsError;

  // special_acupuncture_goal 컬럼 이름은 그대로지만, 이제 "특수한약" 목표값으로
  // 쓴다(대표원장 전용 "이번달 목표 입력"에서만 이 컬럼을 쓴다 — WeeklyDashboard.tsx
  // 참고).
  const { data: goalsRow, error: goalsError } = await admin
    .from('monthly_goals')
    .select(
      'herb_goal, diet_goal, special_acupuncture_goal, chuna_goal, revenue_goal, avg_visits_goal, herb_adjust, diet_adjust, special_herb_adjust, chuna_adjust'
    )
    .eq('month', month)
    .maybeSingle();
  if (goalsError) throw goalsError;

  // 특수한약(공진단/경옥고/녹용관절고/보폐고엔오 등) 실적은 예약관리 쪽에 데이터가
  // 없다 — 비급여 현황에서 그 항목을 등록할 때 "목표 반영"으로 표시해둔 건수를 센다.
  // 한약/다이어트/추나는 예약관리 기록에 비급여 현황에서 같은 범주로 표시해둔
  // 건수를 더한다(예: 비급여로만 판 특수 한약재도 "한약" 목표에 넣고 싶을 때).
  const { data: purchaseRows, error: purchaseError } = await admin
    .from('non_covered_purchases')
    .select('goal_category')
    .gte('purchase_date', monthStart)
    .lt('purchase_date', monthEnd)
    .not('goal_category', 'is', null);
  if (purchaseError) throw purchaseError;

  const purchaseCounts = { herb: 0, diet: 0, special_herb: 0, chuna: 0 };
  for (const row of purchaseRows ?? []) {
    const key = row.goal_category as keyof typeof purchaseCounts;
    if (key in purchaseCounts) purchaseCounts[key] += 1;
  }

  const { data: revenueRows, error: revenueError } = await admin
    .from('daily_revenue')
    .select('date, total_revenue, visit_count, chuna_count')
    .gte('date', monthStart)
    .lt('date', monthEnd);
  if (revenueError) throw revenueError;

  // 월말결산(monthly_revenue_override)은 기준일(as_of_date)까지의 누계다 — 그 달 총매출은
  // 월말결산 + 기준일 이후 일일결산 합계이고, 월말결산표를 다시 붙여넣으면 리셋된다.
  // 기준일이 없는 옛 행만 예전처럼 월말결산 값이 일일결산을 대체한다(monthlyFigures.ts).
  const monthlyFigures = await loadMonthFigures(admin, month, revenueRows ?? []);

  // 지난달 같은 날 대비 문구용 — 지난달 일일결산과 지난달 총매출.
  const prevMonth = previousMonthOf(month);
  const prevRange = monthRange(prevMonth);
  const { data: prevRevenueRows, error: prevRevenueError } = await admin
    .from('daily_revenue')
    .select('date, total_revenue, visit_count')
    .gte('date', prevRange.monthStart)
    .lt('date', prevRange.monthEnd);
  if (prevRevenueError) throw prevRevenueError;
  const prevFigures = await loadMonthFigures(admin, prevMonth, prevRevenueRows ?? []);

  const rows = (records ?? []) as DailyRecordRow[];
  const sum = (key: keyof DailyRecordRow) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

  // 추나는 일일 결산에 입력한 추나 횟수를 우선한다. 그 날짜에 입력이 없으면 예전처럼
  // 예약 명단에서 센 값을 쓴다(날짜별로 하나만 — 두 값을 더하지 않는다).
  const chunaByDate = new Map<string, number>();
  for (const r of rows) chunaByDate.set(r.date, Number(r.chuna_count) || 0);
  for (const d of revenueRows ?? []) {
    if (d.chuna_count != null) chunaByDate.set(d.date, Number(d.chuna_count));
  }
  const chunaTotal = Array.from(chunaByDate.values()).reduce((a, b) => a + b, 0);

  const adjust = {
    herb: Number(goalsRow?.herb_adjust) || 0,
    diet: Number(goalsRow?.diet_adjust) || 0,
    specialHerb: Number(goalsRow?.special_herb_adjust) || 0,
    chuna: Number(goalsRow?.chuna_adjust) || 0,
  };

  const totalVisits = sum('visit_count');
  const recordedDays = rows.length;
  const avgFromReservations = recordedDays > 0 ? Math.round((totalVisits / recordedDays) * 10) / 10 : null;

  const figures = computeMonthFigures(month, monthlyFigures.daily, monthlyFigures.override, avgFromReservations);
  const totalRevenueGoal = goalsRow?.revenue_goal != null ? Number(goalsRow.revenue_goal) : null;
  const prevTotal = computeMonthFigures(prevMonth, prevFigures.daily, prevFigures.override, null).totalRevenue;

  return {
    month,
    avgDailyVisits: figures.avgDailyVisits,
    totalRevenue: figures.totalRevenue,
    averageTicket: figures.averageTicket,
    legacyOverride: figures.legacyOverride,
    motivation: revenueMotivation({
      month,
      today: todayKst(),
      totalRevenue: figures.totalRevenue,
      goal: totalRevenueGoal,
      dataThrough: figures.dataThrough,
      previous: { month: prevMonth, daily: prevFigures.daily, totalRevenue: prevTotal },
    }),
    totalRevenueGoal,
    avgDailyVisitsGoal: goalsRow?.avg_visits_goal != null ? Number(goalsRow.avg_visits_goal) : null,
    goals: {
      herb: {
        achieved: sum('nogyong_count') + sum('ilban_count') + purchaseCounts.herb + adjust.herb,
        goal: goalsRow?.herb_goal ?? null,
        adjust: adjust.herb,
      },
      diet: {
        achieved: sum('diet_count') + purchaseCounts.diet + adjust.diet,
        goal: goalsRow?.diet_goal ?? null,
        adjust: adjust.diet,
      },
      specialHerb: {
        achieved: purchaseCounts.special_herb + adjust.specialHerb,
        goal: goalsRow?.special_acupuncture_goal ?? null,
        adjust: adjust.specialHerb,
      },
      chuna: {
        achieved: chunaTotal + purchaseCounts.chuna + adjust.chuna,
        goal: goalsRow?.chuna_goal ?? null,
        adjust: adjust.chuna,
      },
    },
  };
}

// 이번 주(월요일~오늘) 예약률·부도취소율 — 일일 결산에 입력한 예약 숫자로 계산한다.
export async function getWeeklyRates(today: Date = new Date()): Promise<{
  reservationRate: number | null;
  noShowRate: number | null;
}> {
  const admin = createAdminClient();
  // 서버 시간대(Vercel 은 UTC)와 상관없이 한국 날짜로: 이번 주 월요일 ~ 오늘.
  const todayStr = todayKst(today);
  const dow = new Date(`${todayStr}T00:00:00Z`).getUTCDay(); // 0 = 일요일
  const weekStart = addDaysKst(todayStr, dow === 0 ? -6 : 1 - dow);

  const { data, error } = await admin
    .from('daily_revenue')
    .select('visit_count, excluded_count, reservation_count, kept_count, noshow_count, cancel_count')
    .gte('date', weekStart)
    .lte('date', todayStr);
  if (error) throw error;

  const n = (v: unknown) => (v != null ? Number(v) : null);
  return computeReservationRates(
    (data ?? []).map((r) => ({
      visitCount: n(r.visit_count),
      excludedCount: n(r.excluded_count),
      reservationCount: n(r.reservation_count),
      keptCount: n(r.kept_count),
      noshowCount: n(r.noshow_count),
      cancelCount: n(r.cancel_count),
    }))
  );
}
