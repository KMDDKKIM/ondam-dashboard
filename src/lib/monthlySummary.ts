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

// 예약관리 앱(kh-ondam-reservation)의 daily_records/monthly_goals를 읽는다.
// 같은 hanyak-ondam Supabase 프로젝트를 공유하지만 그쪽 RLS는 anon/authenticated를
// 전부 막고 service_role로만 열어두는 구조라(그 저장소의 schema.sql 참고),
// 여기서도 admin(service_role) 클라이언트로만 접근한다.
export async function getMonthlySummary(): Promise<MonthlySummary> {
  const admin = createAdminClient();

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthStart = `${month}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

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

  const rows = (records ?? []) as DailyRecordRow[];
  const sum = (key: keyof DailyRecordRow) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);

  const totalVisits = sum('visit_count');
  const recordedDays = rows.length;
  const avgDailyVisits = recordedDays > 0 ? Math.round((totalVisits / recordedDays) * 10) / 10 : null;

  return {
    month,
    avgDailyVisits,
    // 매출 데이터는 아직 어디에도 기록되지 않아서 낼 수 없다 — null로 두고
    // 화면에서 "데이터 없음"으로 보여준다.
    totalRevenue: null,
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
