'use client';

import { DURATION_PRESETS } from '@/lib/supabase/nonCoveredPurchases';
import type { GoalCategory } from '@/lib/types';
import { GOAL_CATEGORY_LABEL } from './shared';

interface Props {
  goalCategory: GoalCategory | null;
  onGoalCategoryChange: (value: GoalCategory | null) => void;
  happyCallDate: string;
  onHappyCallDateChange: (value: string) => void;
  durationDays: string;
  onDurationDaysChange: (value: string) => void;
  memo: string;
  onMemoChange: (value: string) => void;
}

const labelStyle = { display: 'block', marginBottom: 4 } as const;

// 등록 폼의 "자세히" 영역: 목표 반영, 한약 수령일/처방일수(해피콜 기준), 메모.
export function PurchaseFormDetails({
  goalCategory,
  onGoalCategoryChange,
  happyCallDate,
  onHappyCallDateChange,
  durationDays,
  onDurationDaysChange,
  memo,
  onMemoChange,
}: Props) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <label className="muted-text" style={labelStyle}>
            목표 반영
          </label>
          <select
            value={goalCategory ?? ''}
            onChange={(e) => onGoalCategoryChange((e.target.value || null) as GoalCategory | null)}
            className="input-field"
            style={{ maxWidth: 130 }}
          >
            <option value="">없음</option>
            {(Object.keys(GOAL_CATEGORY_LABEL) as GoalCategory[]).map((key) => (
              <option key={key} value={key}>
                {GOAL_CATEGORY_LABEL[key]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="muted-text" style={labelStyle}>
            한약 수령일 (해피콜 기준일, 기본: 구매일 다음날)
          </label>
          <input
            type="date"
            value={happyCallDate}
            onChange={(e) => onHappyCallDateChange(e.target.value)}
            className="input-field"
            style={{ maxWidth: 160 }}
          />
        </div>
        <div>
          <label className="muted-text" style={labelStyle}>
            처방일수 (한약일 때만)
          </label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {DURATION_PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDurationDaysChange(String(d))}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--color-line)',
                  background: durationDays === String(d) ? 'var(--color-brand-b)' : 'var(--color-surface-2)',
                  color: durationDays === String(d) ? '#fff' : 'var(--color-ink)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {d}일
              </button>
            ))}
            <input
              type="number"
              placeholder="직접입력"
              value={durationDays}
              onChange={(e) => onDurationDaysChange(e.target.value)}
              className="input-field"
              style={{ maxWidth: 90 }}
            />
          </div>
        </div>
      </div>
      <input placeholder="메모 (선택)" value={memo} onChange={(e) => onMemoChange(e.target.value)} className="input-field" />
    </div>
  );
}
