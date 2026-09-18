'use client';

import { useState } from 'react';
import { DonutProgress } from '@/components/DonutProgress';
import type { MonthlySummary } from '@/lib/monthlySummary';

interface MonthlyStatsPanelProps {
  initial: MonthlySummary;
}

export function MonthlyStatsPanel({ initial }: MonthlyStatsPanelProps) {
  const [summary, setSummary] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/monthly-summary');
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? '불러오지 못했습니다.');
        return;
      }
      setSummary(body as MonthlySummary);
    } catch {
      setError('불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const [year, monthNum] = summary.month.split('-');

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <span>📊</span>
          <span>
            {year}년 {Number(monthNum)}월 현황
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--color-muted)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {loading ? '불러오는 중...' : '↻ 새로고침'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div
          className="card"
          style={{ flex: '1 1 160px', padding: '14px 16px', background: 'var(--color-surface-2)' }}
        >
          <div className="muted-text" style={{ marginBottom: 4 }}>
            총매출
          </div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>
            {summary.totalRevenue != null ? `${summary.totalRevenue.toLocaleString()}원` : '데이터 없음'}
          </div>
        </div>
        <div
          className="card"
          style={{ flex: '1 1 160px', padding: '14px 16px', background: 'var(--color-surface-2)' }}
        >
          <div className="muted-text" style={{ marginBottom: 4 }}>
            일평균 환자수
          </div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>
            {summary.avgDailyVisits != null ? `${summary.avgDailyVisits}명` : '데이터 없음'}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))',
          gap: 12,
          justifyItems: 'center',
        }}
      >
        <DonutProgress
          label="한약"
          achieved={summary.goals.herb.achieved}
          goal={summary.goals.herb.goal}
          color="var(--color-teal)"
        />
        <DonutProgress
          label="다이어트"
          achieved={summary.goals.diet.achieved}
          goal={summary.goals.diet.goal}
          color="var(--color-orange)"
        />
        <DonutProgress
          label="특수약침"
          achieved={summary.goals.specialAcupuncture.achieved}
          goal={summary.goals.specialAcupuncture.goal}
          color="var(--color-purple)"
        />
        <DonutProgress
          label="추나"
          achieved={summary.goals.chuna.achieved}
          goal={summary.goals.chuna.goal}
          color="var(--color-blue)"
        />
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
