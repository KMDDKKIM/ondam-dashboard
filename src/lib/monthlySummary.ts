import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveMonthlyFigures } from '@/lib/monthlyFigures';

export interface MonthlySummary {
  month: string;
  avgDailyVisits: number | null;
  totalRevenue: number | null;
  goals: {
    herb: { achieved: number; goal: number | null };
    diet: { achieved: number; goal: number | null };
    specialHerb: { achieved: number; goal: number | null };
    chuna: { achieved: number; goal: number | null };
  };
}

interface DailyRecordRow {
  visit_count: number | null;
  nogyong_count: number | null;
  ilban_count: number | null;
  chuna_count: number | null;
  diet_count: number | null;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(month: string): { monthStart: string; monthEnd: string } {
  const [y, m] = month.split('-').map(Number);
  const monthStart = `${month}-01`;
  const next = new Date(y, m, 1);
  const monthEnd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  return { monthStart, monthEnd };
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
    .select('visit_count, nogyong_count, ilban_count, chuna_count, diet_count')
    .is('deleted_at', null)
    .gte('date', monthStart)
    .lt('date', monthEnd);
  if (recordsError) throw recordsError;

  // special_acupuncture_goal 컬럼 이름은 그대로지만, 이제 "특수한약" 목표값으로
  // 쓴다(대표원장 전용 "이번달 목표 입력"에서만 이 컬럼을 쓴다 — WeeklyDashboard.tsx
  // 참고).
  const { data: goalsRow, error: goalsError } = await admin
    .from('monthly_goals')
    .select('herb_goal, diet_goal, special_acupuncture_goal, chuna_goal')
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
    .select('total_revenue, visit_count')
    .gte('date', monthStart)
    .lt('date', monthEnd);
  if (revenueError) throw revenueError;

  // 월말결산이 들어온 적 있으면(monthly_revenue_override) 총매출·일평균 환자수 모두
  // 그 값이 항상 우선한다 — 일일결산을 누적한 값은 환불 등으로 어긋날 수 있어서
  // 월말결산표가 더 정확한 원본이다("중간 수정 시 리셋").
  const { data: overrideRow, error: overrideError } = await admin
    .from('monthly_revenue_override')
    .select('total_revenue, avg_daily_visits')
    .eq('month', month)
    .maybeSingle();
  if (overrideError) throw overrideError;

  const rows = (records ?? []) as DailyRecordRow[];
  const sum = (key: keyof DailyRecordRow) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

  const totalVisits = sum('visit_count');
  const recordedDays = rows.length;
  const avgFromReservations = recordedDays > 0 ? Math.round((totalVisits / recordedDays) * 10) / 10 : null;

  const { totalRevenue, avgDailyVisits } = resolveMonthlyFigures(
    (revenueRows ?? []).map((r) => ({
      totalRevenue: Number(r.total_revenue) || 0,
      visitCount: r.visit_count != null ? Number(r.visit_count) : null,
    })),
    overrideRow
      ? {
          totalRevenue: Number(overrideRow.total_revenue),
          avgDailyVisits: overrideRow.avg_daily_visits != null ? Number(overrideRow.avg_daily_visits) : null,
        }
      : null,
    avgFromReservations
  );

  return {
    month,
    avgDailyVisits,
    totalRevenue,
    goals: {
      herb: {
        achieved: sum('nogyong_count') + sum('ilban_count') + purchaseCounts.herb,
        goal: goalsRow?.herb_goal ?? null,
      },
      diet: { achieved: sum('diet_count') + purchaseCounts.diet, goal: goalsRow?.diet_goal ?? null },
      specialHerb: {
        achieved: purchaseCounts.special_herb,
        goal: goalsRow?.special_acupuncture_goal ?? null,
      },
      chuna: { achieved: sum('chuna_count') + purchaseCounts.chuna, goal: goalsRow?.chuna_goal ?? null },
    },
  };
}
