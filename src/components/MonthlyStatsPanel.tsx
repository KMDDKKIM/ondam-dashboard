'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { DonutProgress } from '@/components/DonutProgress';
import { achievementPercent, goalPace, revenuePace, shortfallCount } from '@/lib/monthlyFigures';
import type { MonthlySummary } from '@/lib/monthlySummary';

interface MonthlyStatsPanelProps {
  initial: MonthlySummary;
  isOwner: boolean;
  // 예약관리 화면처럼 좁은 자리에 얹을 때 — 카드/도넛을 작게 줄이고 한 줄에 몰아 넣는다.
  compact?: boolean;
  /** 홈처럼 전체 폭으로 크게 보여 줄 때: 지표를 가로로 늘어놓고 글자와 도넛을 키운다. */
  large?: boolean;
  // 총매출/일평균 환자수 옆에 나란히 붙는 추가 카드(예: 예약률, 부도취소율).
  extraTiles?: ReactNode;
}

const GOAL_FIELDS = [
  { key: 'revenueGoal', summaryKey: 'revenue', label: '총매출(원)', width: 130 },
  { key: 'avgVisitsGoal', summaryKey: 'avgVisits', label: '일평균 환자수(명)', width: 110 },
  { key: 'herbGoal', summaryKey: 'herb', label: '한약', width: 90 },
  { key: 'dietGoal', summaryKey: 'diet', label: '다이어트', width: 90 },
  { key: 'specialHerbGoal', summaryKey: 'specialHerb', label: '특수한약', width: 90 },
  { key: 'chunaGoal', summaryKey: 'chuna', label: '추나', width: 90 },
] as const;

const ADJUST_FIELDS = [
  { key: 'herbAdjust', label: '한약' },
  { key: 'dietAdjust', label: '다이어트' },
  { key: 'specialHerbAdjust', label: '특수한약' },
  { key: 'chunaAdjust', label: '추나' },
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

export function MonthlyStatsPanel({ initial, isOwner, compact = false, large = false, extraTiles }: MonthlyStatsPanelProps) {
  const row = compact || large; // 지표 카드와 도넛을 한 줄(가로)로 놓는 배치
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
      revenueGoal: summary.totalRevenueGoal != null ? String(summary.totalRevenueGoal) : '',
      avgVisitsGoal: summary.avgDailyVisitsGoal != null ? String(summary.avgDailyVisitsGoal) : '',
      herbGoal: summary.goals.herb.goal != null ? String(summary.goals.herb.goal) : '',
      dietGoal: summary.goals.diet.goal != null ? String(summary.goals.diet.goal) : '',
      specialHerbGoal: summary.goals.specialHerb.goal != null ? String(summary.goals.specialHerb.goal) : '',
      chunaGoal: summary.goals.chuna.goal != null ? String(summary.goals.chuna.goal) : '',
      herbAdjust: String(summary.goals.herb.adjust),
      dietAdjust: String(summary.goals.diet.adjust),
      specialHerbAdjust: String(summary.goals.specialHerb.adjust),
      chunaAdjust: String(summary.goals.chuna.adjust),
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
          revenueGoal: goalInputs.revenueGoal || null,
          avgVisitsGoal: goalInputs.avgVisitsGoal || null,
          herbGoal: goalInputs.herbGoal || null,
          dietGoal: goalInputs.dietGoal || null,
          specialHerbGoal: goalInputs.specialHerbGoal || null,
          chunaGoal: goalInputs.chunaGoal || null,
          herbAdjust: goalInputs.herbAdjust || 0,
          dietAdjust: goalInputs.dietAdjust || 0,
          specialHerbAdjust: goalInputs.specialHerbAdjust || 0,
          chunaAdjust: goalInputs.chunaAdjust || 0,
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
          {GOAL_FIELDS.map(({ key, label, width }) => (
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
                style={{ width, padding: '6px 8px' }}
              />
            </div>
          ))}
          <div style={{ flexBasis: '100%', borderTop: '1px solid var(--color-line)', paddingTop: 10 }}>
            <div className="muted-text" style={{ fontSize: 12, marginBottom: 8 }}>
              실적 보정 (+/−) — 자동 집계가 틀렸을 때 숫자를 더하거나 빼요. 예: 한약이 2건 많게 잡혔으면 −2
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {ADJUST_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label className="muted-text" style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                    {label} 보정
                  </label>
                  <input
                    type="number"
                    step={1}
                    value={goalInputs[key] ?? '0'}
                    onChange={(e) => setGoalInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="input-field"
                    style={{ width: 90, padding: '6px 8px' }}
                  />
                </div>
              ))}
            </div>
          </div>
          <button onClick={saveGoals} disabled={savingGoals} className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
            {savingGoals ? '저장 중...' : '저장'}
          </button>
          {goalError && <span className="error-text">{goalError}</span>}
        </div>
      )}

      <div
        style={row ? { display: 'flex', gap: large ? 24 : 16, flexWrap: 'wrap', alignItems: 'center' } : undefined}
      >
        <div
          style={{
            display: 'flex',
            gap: large ? 12 : compact ? 8 : 16,
            marginBottom: row ? 0 : 20,
            flexWrap: 'wrap',
            flex: large ? '1 1 460px' : row ? '1 1 360px' : undefined,
          }}
        >
          {extraTiles}
          <StatTile
            label="총매출"
            compact={compact && !large}
            big={large}
            achieved={summary.totalRevenue}
            goal={summary.totalRevenueGoal}
            unit="원"
            pace={revenuePace(summary.totalRevenue, summary.totalRevenueGoal, summary.month, new Date())}
            footer={<RevenueNotes summary={summary} compact={compact && !large} big={large} />}
          >
            {summary.totalRevenue != null ? `${summary.totalRevenue.toLocaleString()}원` : '데이터 없음'}
          </StatTile>
          <StatTile
            label="일평균 환자수"
            compact={compact && !large}
            big={large}
            achieved={summary.avgDailyVisits}
            goal={summary.avgDailyVisitsGoal}
            unit="명"
          >
            {summary.avgDailyVisits != null ? `${summary.avgDailyVisits}명` : '데이터 없음'}
          </StatTile>
          {summary.averageTicket != null && (
            <StatTile label="객단가" compact={compact && !large}
            big={large} title="총진료비 ÷ 총 내원 인원">
              {summary.averageTicket.toLocaleString()}원
            </StatTile>
          )}
        </div>

        <div
          style={
            row
              ? { display: 'flex', gap: large ? 16 : 14, justifyContent: 'center', flex: '0 0 auto' }
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
          ).map(([label, key, color]) => {
            const { achieved, goal } = summary.goals[key];
            const pace = goalPace(achieved, goal, summary.month, new Date());
            return (
              <DonutProgress
                key={key}
                label={label}
                achieved={achieved}
                goal={goal}
                color={color}
                size={large ? 92 : compact ? 64 : 84}
                pace={pace?.status ?? null}
                shortfall={pace ? shortfallCount(achieved, pace.expected) : 0}
              />
            );
          })}
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

// 총매출 아래 안내 — 기준일 없는 월말결산 경고, 목표 달성/남은 금액/필요 일평균/월말 예상/지난달 대비.
// 매출·목표는 모든 직원에게 보인다(권한 구분 없음).
function RevenueNotes({ summary, compact, big }: { summary: MonthlySummary; compact?: boolean; big?: boolean }) {
  const { legacyOverride, motivation } = summary;
  if (!legacyOverride && motivation.lines.length === 0) return null;
  const fontSize = big ? 13 : compact ? 10 : 12;
  return (
    <div style={{ marginTop: compact ? 4 : 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {legacyOverride && (
        <div style={{ fontSize, color: 'var(--color-orange)', fontWeight: 600 }}>
          월말결산 값이 있어 일일 마감이 합산되지 않아요 (기준일 없음)
        </div>
      )}
      {motivation.lines.map((line, i) => (
        <div
          key={i}
          className={i === 0 && motivation.reached ? undefined : 'muted-text'}
          style={{
            fontSize,
            ...(i === 0 && motivation.reached ? { fontWeight: 700, color: 'var(--color-green)' } : {}),
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

export function StatTile({
  label,
  compact,
  big,
  children,
  achieved = null,
  goal = null,
  unit = '',
  pace = null,
  title,
  footer,
}: {
  label: string;
  compact?: boolean;
  /** 홈의 큰 현황: 숫자를 크게 */
  big?: boolean;
  children: ReactNode;
  achieved?: number | null;
  goal?: number | null;
  unit?: string;
  pace?: 'behind' | 'onTrack' | null;
  title?: string;
  footer?: ReactNode;
}) {
  const percent = achievementPercent(achieved, goal);
  return (
    <div
      className="card"
      title={title}
      style={{
        flex: compact ? '1 1 100px' : big ? '1 1 140px' : '1 1 160px',
        padding: compact ? '8px 12px' : big ? '16px 16px' : '14px 16px',
        background: 'var(--color-surface-2)',
      }}
    >
      <div className="muted-text" style={{ marginBottom: compact ? 2 : 4, fontSize: compact ? 11 : big ? 14 : undefined }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: compact ? 15 : big ? 'clamp(20px, 1.75vw, 28px)' : 18, lineHeight: 1.2 }}>{children}</div>
      {goal != null && goal > 0 && (
        <div style={{ marginTop: compact ? 4 : 8 }}>
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: 'var(--color-line)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(percent ?? 0, 100)}%`,
                height: '100%',
                background: (percent ?? 0) >= 100 ? 'var(--color-green)' : 'var(--color-brand-b)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <div className="muted-text" style={{ marginTop: 3, fontSize: compact ? 10 : big ? 13 : 12 }}>
            목표 {goal.toLocaleString()}
            {unit} · {percent != null ? `${percent}%` : '-'}
          </div>
          {pace && (
            <div
              style={{
                marginTop: 3,
                fontSize: compact ? 10 : 12,
                fontWeight: 700,
                color: pace === 'behind' ? 'var(--color-error)' : 'var(--color-green)',
              }}
            >
              {pace === 'behind' ? '📉 매출향상이 필요해요' : '👍 매출이 안정적이에요'}
            </div>
          )}
        </div>
      )}
      {footer}
    </div>
  );
}
