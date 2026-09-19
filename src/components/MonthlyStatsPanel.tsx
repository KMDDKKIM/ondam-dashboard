'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { DonutProgress } from '@/components/DonutProgress';
import type { MonthlySummary } from '@/lib/monthlySummary';

interface MonthlyStatsPanelProps {
  initial: MonthlySummary;
  isOwner: boolean;
  // 예약관리 화면처럼 좁은 자리에 얹을 때 — 카드/도넛을 작게 줄이고 한 줄에 몰아 넣는다.
  compact?: boolean;
  // 총매출/일평균 환자수 옆에 나란히 붙는 추가 카드(예: 예약률, 부도취소율).
  extraTiles?: ReactNode;
}

const GOAL_FIELDS = [
  { key: 'herbGoal', summaryKey: 'herb', label: '한약' },
  { key: 'dietGoal', summaryKey: 'diet', label: '다이어트' },
  { key: 'specialHerbGoal', summaryKey: 'specialHerb', label: '특수한약' },
  { key: 'chunaGoal', summaryKey: 'chuna', label: '추나' },
] as const;

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function MonthlyStatsPanel({ initial, isOwner, compact = false, extraTiles }: MonthlyStatsPanelProps) {
  const [summary, setSummary] = useState(initial);
  const [month, setMonth] = useState(initial.month);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickingMonth, setPickingMonth] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalInputs, setGoalInputs] = useState<Record<string, string>>({});
  const [savingGoals, setSavingGoals] = useState(false);
  const [goalError, setGoalError] = useState('');

  async function load(targetMonth: string) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/monthly-summary?month=${targetMonth}`);
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

  useEffect(() => {
    if (month !== initial.month) load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function openGoalForm() {
    setGoalInputs({
      herbGoal: summary.goals.herb.goal != null ? String(summary.goals.herb.goal) : '',
      dietGoal: summary.goals.diet.goal != null ? String(summary.goals.diet.goal) : '',
      specialHerbGoal: summary.goals.specialHerb.goal != null ? String(summary.goals.specialHerb.goal) : '',
      chunaGoal: summary.goals.chuna.goal != null ? String(summary.goals.chuna.goal) : '',
    });
    setGoalError('');
    setShowGoalForm(true);
  }

  async function saveGoals() {
    setSavingGoals(true);
    setGoalError('');
    try {
      const response = await fetch('/api/monthly-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          herbGoal: goalInputs.herbGoal || null,
          dietGoal: goalInputs.dietGoal || null,
          specialHerbGoal: goalInputs.specialHerbGoal || null,
          chunaGoal: goalInputs.chunaGoal || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? '저장에 실패했습니다.');
      setShowGoalForm(false);
      await load(month);
    } catch (err) {
      setGoalError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSavingGoals(false);
    }
  }

  const [year, monthNum] = summary.month.split('-');
  const isCurrentMonth = month >= currentMonth();

  return (
    <div className="card" style={{ padding: compact ? 14 : 20, marginBottom: compact ? 0 : 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: compact ? 10 : 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
          <span style={{ marginRight: 4 }}>📊</span>
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="이전 달"
            style={{ border: 'none', background: 'transparent', fontSize: 16, padding: '0 6px', color: 'var(--color-ink)' }}
          >
            ◀
          </button>
          {pickingMonth ? (
            <input
              type="month"
              value={month}
              autoFocus
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
                setPickingMonth(false);
              }}
              onBlur={() => setPickingMonth(false)}
              className="input-field"
              style={{ padding: '4px 8px', width: 150 }}
            />
          ) : (
            <button
              onClick={() => setPickingMonth(true)}
              style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 15, color: 'var(--color-ink)' }}
            >
              {year}년 {Number(monthNum)}월 현황
            </button>
          )}
          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={isCurrentMonth}
            aria-label="다음 달"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 16,
              padding: '0 6px',
              color: isCurrentMonth ? 'var(--color-line)' : 'var(--color-ink)',
              cursor: isCurrentMonth ? 'default' : 'pointer',
            }}
          >
            ▶
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isOwner && (
            <button
              onClick={() => (showGoalForm ? setShowGoalForm(false) : openGoalForm())}
              style={{ border: 'none', background: 'transparent', color: 'var(--color-brand-b)', fontSize: 13, fontWeight: 600 }}
            >
              🎯 목표 입력
            </button>
          )}
          <button
            onClick={() => load(month)}
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
      </div>

      {showGoalForm && (
        <div
          className="card"
          style={{ padding: 14, marginBottom: 16, background: 'var(--color-surface-2)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}
        >
          {GOAL_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="muted-text" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                {label} 목표
              </label>
              <input
                type="number"
                min={0}
                value={goalInputs[key] ?? ''}
                onChange={(e) => setGoalInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                className="input-field"
                style={{ width: 90, padding: '6px 8px' }}
              />
            </div>
          ))}
          <button onClick={saveGoals} disabled={savingGoals} className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
            {savingGoals ? '저장 중...' : '저장'}
          </button>
          {goalError && <span className="error-text">{goalError}</span>}
        </div>
      )}

      <div
        style={compact ? { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' } : undefined}
      >
        <div
          style={{
            display: 'flex',
            gap: compact ? 8 : 16,
            marginBottom: compact ? 0 : 20,
            flexWrap: 'wrap',
            flex: compact ? '1 1 360px' : undefined,
          }}
        >
          {extraTiles}
          <StatTile label="총매출" compact={compact}>
            {summary.totalRevenue != null ? `${summary.totalRevenue.toLocaleString()}원` : '데이터 없음'}
          </StatTile>
          <StatTile label="일평균 환자수" compact={compact}>
            {summary.avgDailyVisits != null ? `${summary.avgDailyVisits}명` : '데이터 없음'}
          </StatTile>
        </div>

        <div
          style={
            compact
              ? { display: 'flex', gap: 14, justifyContent: 'center', flex: '0 0 auto' }
              : { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 12, justifyItems: 'center' }
          }
        >
          {(
            [
              ['한약', 'herb', 'var(--color-teal)'],
              ['다이어트', 'diet', 'var(--color-orange)'],
              ['특수한약', 'specialHerb', 'var(--color-purple)'],
              ['추나', 'chuna', 'var(--color-blue)'],
            ] as const
          ).map(([label, key, color]) => (
            <DonutProgress
              key={key}
              label={label}
              achieved={summary.goals[key].achieved}
              goal={summary.goals[key].goal}
              color={color}
              size={compact ? 64 : 84}
            />
          ))}
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export function StatTile({ label, compact, children }: { label: string; compact?: boolean; children: ReactNode }) {
  return (
    <div
      className="card"
      style={{
        flex: compact ? '1 1 100px' : '1 1 160px',
        padding: compact ? '8px 12px' : '14px 16px',
        background: 'var(--color-surface-2)',
      }}
    >
      <div className="muted-text" style={{ marginBottom: compact ? 2 : 4, fontSize: compact ? 11 : undefined }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: compact ? 15 : 18 }}>{children}</div>
    </div>
  );
}
