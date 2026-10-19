'use client';

import { computeWeeklyStats } from '@/lib/reservations/dashboardStats';
import { MonthlyStatsPanel, StatTile } from '@/components/MonthlyStatsPanel';
import type { DailyRecordSummary } from '@/lib/reservations/types';
import type { MonthlySummary } from '@/lib/monthlySummary';
import type { WeekTrend } from '@/lib/weeklyTrend';

interface WeeklyDashboardProps {
  records: DailyRecordSummary[];
  // 이번달 현황을 못 불러왔으면 null — 패널 대신 오류 문구를 보여 준다.
  summary: MonthlySummary | null;
  isOwner: boolean;
  // 이번 주 예약률·부도취소율 — 일일 결산에 입력한 예약 숫자로 계산한 값(서버에서 내려준다).
  rates: { reservationRate: number | null; noShowRate: number | null };
  // 이번 주·지난주·지지난주 동향. 못 불러왔으면 null(표를 숨긴다).
  weeklyTrend?: WeekTrend[] | null;
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
export function WeeklyDashboard({ records, summary, isOwner, rates, weeklyTrend = null }: WeeklyDashboardProps) {
  const stats = computeWeeklyStats(records, new Date());

  return (
    <section className="weekly-dashboard" style={{ marginBottom: 12 }}>
      <div className="no-print">
        {summary ? (
          <MonthlyStatsPanel
            initial={summary}
            isOwner={isOwner}
            compact
            showPace={false}
            extraTiles={
              <>
                <StatTile label="이번 주 예약률" compact title="이번 주 예약 정상 이행 ÷ (내원환자수 − 제외환자수)">
                  <span style={{ color: 'var(--color-teal-deep)' }}>
                    {rates.reservationRate != null ? `${rates.reservationRate}%` : '-'}
                  </span>
                </StatTile>
                <StatTile label="이번 주 부도취소율" compact title="이번 주 (예약 노쇼 + 예약 취소) ÷ 예약 환자수">
                  <span style={{ color: 'var(--color-error)' }}>
                    {rates.noShowRate != null ? `${rates.noShowRate}%` : '-'}
                  </span>
                </StatTile>
              </>
            }
          />
        ) : (
          <p className="error-text">이번달 현황을 불러오지 못했습니다.</p>
        )}
        {weeklyTrend && weeklyTrend.length > 0 && <WeeklyTrendTable weeks={weeklyTrend} />}
      </div>

      {/* 인쇄용 — 아침 브리핑 출력지에 그대로 남는 한 줄 요약(화면에는 안 보임). */}
      <div className="print-only" style={{ padding: '6px 12px', fontWeight: 600, fontSize: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <div>이번 주 예약률: {rates.reservationRate != null ? `${rates.reservationRate}%` : '-'}</div>
          <div>이번 주 부도취소율: {rates.noShowRate != null ? `${rates.noShowRate}%` : '-'}</div>
          {/* 예전에는 여기서 한약·다이어트를 옛 컬럼(녹용/일반/다이어트 수)으로 합산해 찍었는데, 화면 패널
              (비급여 등록분 + 조정값 포함)과 숫자가 달랐다. 주간 값을 패널 기준으로 구할 재료가
              없어서 뺐다 — 한약·다이어트는 아래 "이번달 목표" 줄이 패널과 같은 숫자를 보여 준다. */}
          <div>이번 주 추나(예약 명단 기준): {stats.chunaTotal}건</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginTop: 4 }}>
          <span>이번달 현황/목표</span>
          {!summary && <span>불러오지 못했습니다</span>}
          {summary &&
            GOAL_LABELS.map(([key, label]) => {
            const item = summary.goals[key];
            return (
              <span key={key}>
                {label}: {item.goal != null ? `${item.achieved}/${item.goal}` : `${item.achieved}건`}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function monthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

// 주별 동향 — 이번 주만이 아니라 지난주·지지난주까지 같이 보여 줘서 흐름을 본다. 이번 주는 오늘까지만 센 값이다.
function WeeklyTrendTable({ weeks }: { weeks: WeekTrend[] }) {
  const cell = { padding: '4px 10px', textAlign: 'right', whiteSpace: 'nowrap' } as const;
  const pct = (v: number | null) => (v != null ? `${v}%` : '-');
  return (
    <div className="card" style={{ marginTop: 8, padding: '6px 10px', overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <caption className="muted-text" style={{ textAlign: 'left', fontSize: 11, paddingBottom: 2 }}>
          주별 동향 (월~일, 이번 주는 오늘까지) · 평환수는 진료한 날의 하루 평균 · 객단가는 주간매출 ÷ 내원 인원
        </caption>
        <thead>
          <tr className="muted-text" style={{ fontSize: 11 }}>
            <th style={{ ...cell, textAlign: 'left' }}>주</th>
            <th style={cell}>예약률</th>
            <th style={cell}>부도취소율</th>
            <th style={cell}>주간매출</th>
            <th style={cell}>평환수</th>
            <th style={cell}>객단가</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w, i) => (
            <tr key={w.weekStart} style={{ borderTop: '1px solid var(--color-line)', fontWeight: i === 0 ? 700 : 400 }}>
              <td style={{ ...cell, textAlign: 'left' }}>
                {w.label} <span className="muted-text" style={{ fontSize: 11, fontWeight: 400 }}>{monthDay(w.weekStart)}~{monthDay(w.weekEnd)}</span>
              </td>
              <td style={{ ...cell, color: 'var(--color-teal-deep)' }}>{pct(w.reservationRate)}</td>
              <td style={{ ...cell, color: 'var(--color-error)' }}>{pct(w.noShowRate)}</td>
              <td style={cell}>{w.totalRevenue != null ? `${w.totalRevenue.toLocaleString()}원` : '-'}</td>
              <td style={cell}>{w.avgDailyVisits != null ? `${w.avgDailyVisits}명` : '-'}</td>
              <td style={cell}>{w.averageTicket != null ? `${w.averageTicket.toLocaleString()}원` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
