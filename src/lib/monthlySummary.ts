import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface MonthlySummary {
  month: string;
  avgDailyVisits: number | null;
  totalRevenue: number | null;
  goals: {
    herb: { achieved: number; goal: number | null };
    diet: { achieved: number; goal: number | null };
    specialAcupuncture: { achieved: number; goal: number | null };
    chuna: { achieved: number; goal: number | null };
  };
}

interface DailyRecordRow {
  visit_count: number | null;
  nogyong_count: number | null;
  ilban_count: number | null;
  chuna_count: number | null;
  diet_count: number | null;
  special_acupuncture_count: number | null;
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
    .select('visit_count, nogyong_count, ilban_count, chuna_count, diet_count, special_acupuncture_count')
    .is('deleted_at', null)
    .gte('date', monthStart)
    .lt('date', monthEnd);
  if (recordsError) throw recordsError;

  const { data: goalsRow, error: goalsError } = await admin
    .from('monthly_goals')
    .select('herb_goal, diet_goal, special_acupuncture_goal, chuna_goal')
    .eq('month', month)
    .maybeSingle();
  if (goalsError) throw goalsError;

  const { data: revenueRows, error: revenueError } = await admin
    .from('daily_revenue')
    .select('total_revenue')
    .gte('date', monthStart)
    .lt('date', monthEnd);
  if (revenueError) throw revenueError;

  // 월말결산으로 그 달 총매출이 덮어써진 적 있으면(monthly_revenue_override)
  // 그 값이 항상 우선한다 — 당일결산을 누적한 daily_revenue 합계보다 정확한
  // 원본 소스이기 때문("중간 수정 시 리셋").
  const { data: overrideRow, error: overrideError } = await admin
    .from('monthly_revenue_override')
    .select('total_revenue')
    .eq('month', month)
    .maybeSingle();
  if (overrideError) throw overrideError;

  const rows = (records ?? []) as DailyRecordRow[];
  const sum = (key: keyof DailyRecordRow) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

  const totalVisits = sum('visit_count');
  const recordedDays = rows.length;
  const avgDailyVisits = recordedDays > 0 ? Math.round((totalVisits / recordedDays) * 10) / 10 : null;

  const revenueDays = revenueRows ?? [];
  const dailySumRevenue =
    revenueDays.length > 0
      ? revenueDays.reduce((acc, r) => acc + (Number(r.total_revenue) || 0), 0)
      : null;
  const totalRevenue = overrideRow ? Number(overrideRow.total_revenue) : dailySumRevenue;

  return {
    month,
    avgDailyVisits,
    totalRevenue,
    goals: {
      herb: { achieved: sum('nogyong_count') + sum('ilban_count'), goal: goalsRow?.herb_goal ?? null },
      diet: { achieved: sum('diet_count'), goal: goalsRow?.diet_goal ?? null },
      specialAcupuncture: {
        achieved: sum('special_acupuncture_count'),
        goal: goalsRow?.special_acupuncture_goal ?? null,
      },
      chuna: { achieved: sum('chuna_count'), goal: goalsRow?.chuna_goal ?? null },
    },
  };
}
