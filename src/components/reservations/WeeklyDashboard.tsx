'use client';

import { printSummaryLines } from '@/lib/reservations/printSummary';
import { MonthlyStatsPanel, StatTile } from '@/components/MonthlyStatsPanel';
import type { MonthlySummary } from '@/lib/monthlySummary';
import type { WeekTrend } from '@/lib/weeklyTrend';

interface WeeklyDashboardProps {
  // 이번달 현황을 못 불러왔으면 null — 패널 대신 오류 문구를 보여 준다.
  summary: MonthlySummary | null;
  isOwner: boolean;
  // 이번 주 예약률·부도취소율 — 일일 결산에 입력한 예약 숫자로 계산한 값(서버에서 내려준다).
  rates: { reservationRate: number | null; noShowRate: number | null };
  // 이번 주·지난주·지지난주 동향. 못 불러왔으면 null(표를 숨긴다).
  weeklyTrend?: WeekTrend[] | null;
}

// 맨 위 "이번달 현황"은 홈 대시보드와 같은 패널(MonthlyStatsPanel)을 작게 줄여서
// 그대로 얹는다 — 목표 입력(대표원장 전용)도 여기서 똑같이 된다. 예약률/부도취소율은
// 이 화면에서만 쓰는 지표라 같은 줄에 카드로 덧붙였다.
export function WeeklyDashboard({ summary, isOwner, rates, weeklyTrend = null }: WeeklyDashboardProps) {
  // 인쇄할 때 위쪽에 같이 찍히는 이번달 현황 + 주별 현황 줄
  const printLines = printSummaryLines(summary, weeklyTrend);

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

      {/* 인쇄용 — 예약 시트 위에 이번달 현황 한 줄과 주별 현황(이번 주·지난주·지지난주)이 같이 찍힌다(화면에는 안 보임). */}
      <div className="print-only" style={{ padding: '6px 12px', fontWeight: 600, fontSize: 12 }}>
        {printLines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </section>
  );
}

function monthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

// 주별 현황 — 이번 주만이 아니라 지난주·지지난주까지 같이 보여 줘서 흐름을 본다. 이번 주는 오늘까지만 센 값이다.
function WeeklyTrendTable({ weeks }: { weeks: WeekTrend[] }) {
  const cell = { padding: '4px 10px', textAlign: 'right', whiteSpace: 'nowrap' } as const;
  const pct = (v: number | null) => (v != null ? `${v}%` : '-');
  // 비급여를 못 읽은 주만 있으면 열 자체를 숨긴다.
  const hasNonCovered = weeks.some((w) => w.nonCovered != null);
  return (
    <div className="card" style={{ marginTop: 8, padding: '6px 10px', overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <caption className="muted-text" style={{ textAlign: 'left', fontSize: 11, paddingBottom: 2 }}>
          주별 현황 (월~일, 이번 주는 오늘까지) · 평환수는 진료한 날의 하루 평균 · 객단가는 주간매출 ÷ 내원 인원 · 비급여는 목표 반영으로 표시한 결제 건수(추나는 일일결산 횟수 포함)
        </caption>
        <thead>
          <tr className="muted-text" style={{ fontSize: 11 }}>
            <th style={{ ...cell, textAlign: 'left' }}>주</th>
            <th style={cell}>예약률</th>
            <th style={cell}>부도취소율</th>
            <th style={cell}>주간매출</th>
            <th style={cell}>평환수</th>
            <th style={cell}>객단가</th>
            {hasNonCovered && (
              <>
                <th style={cell}>한약</th>
                <th style={cell}>다이어트</th>
                <th style={cell}>특수한약</th>
                <th style={cell}>추나</th>
              </>
            )}
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
              {hasNonCovered && (
                <>
                  <td style={cell}>{w.nonCovered ? `${w.nonCovered.herb}건` : '-'}</td>
                  <td style={cell}>{w.nonCovered ? `${w.nonCovered.diet}건` : '-'}</td>
                  <td style={cell}>{w.nonCovered ? `${w.nonCovered.specialHerb}건` : '-'}</td>
                  <td style={cell}>{w.nonCovered ? `${w.nonCovered.chuna}건` : '-'}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
