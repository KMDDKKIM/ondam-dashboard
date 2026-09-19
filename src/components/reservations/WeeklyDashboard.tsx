'use client';

import { computeWeeklyStats } from '@/lib/reservations/dashboardStats';
import { MonthlyStatsPanel, StatTile } from '@/components/MonthlyStatsPanel';
import type { DailyRecordSummary } from '@/lib/reservations/types';
import type { MonthlySummary } from '@/lib/monthlySummary';

interface WeeklyDashboardProps {
  records: DailyRecordSummary[];
  summary: MonthlySummary;
  isOwner: boolean;
}

const GOAL_LABELS = [
  ['herb', '한약'],
  ['diet', '다이어트'],
  ['specialHerb', '특수한약'],
  ['chuna', '추나'],
] as const;

// 맨 위 "이번달 현황"은 홈 대시보드와 같은 패널(MonthlyStatsPanel)을 작게 줄여서
// 그대로 얹는다 — 목표 입력(대표원장 전용)도 여기서 똑같이 된다. 예약률/부도취소율은
// 이 화면에서만 쓰는 지표라 같은 줄에 카드로 덧붙였다.
export function WeeklyDashboard({ records, summary, isOwner }: WeeklyDashboardProps) {
  const stats = computeWeeklyStats(records, new Date());

  return (
    <section className="weekly-dashboard" style={{ marginBottom: 12 }}>
      <div className="no-print">
        <MonthlyStatsPanel
          initial={summary}
          isOwner={isOwner}
          compact
          extraTiles={
            <>
              <StatTile label="예약률" compact>
                <span style={{ color: 'var(--color-teal-deep)' }}>
                  {stats.reservationRate != null ? `${stats.reservationRate}%` : '-'}
                </span>
              </StatTile>
              <StatTile label="부도취소율" compact>
                <span style={{ color: 'var(--color-error)' }}>
                  {stats.noShowRate != null ? `${stats.noShowRate}%` : '-'}
                </span>
              </StatTile>
            </>
          }
        />
      </div>

      {/* 인쇄용 — 아침 브리핑 출력지에 그대로 남는 한 줄 요약(화면에는 안 보임). */}
      <div className="print-only" style={{ padding: '6px 12px', fontWeight: 600, fontSize: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <div>예약률: {stats.reservationRate != null ? `${stats.reservationRate}%` : '-'}</div>
          <div>부도취소율: {stats.noShowRate != null ? `${stats.noShowRate}%` : '-'}</div>
          <div>
            한약: {stats.herbTotal}건 (녹용 {stats.nogyongTotal} / 일반 {stats.ilbanTotal})
          </div>
          <div>추나: {stats.chunaTotal}건</div>
          <div>다이어트: {stats.dietTotal}건</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginTop: 4 }}>
          <span>이번달 목표</span>
          {GOAL_LABELS.map(([key, label]) => {
            const item = summary.goals[key];
            return (
              <span key={key}>
                {label}: {item.goal != null ? `${item.achieved}/${item.goal}` : '-'}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
