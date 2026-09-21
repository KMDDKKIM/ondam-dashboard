import type { CSSProperties } from 'react';
import type { GoalCategory } from '@/lib/types';

export const GOAL_CATEGORY_LABEL: Record<GoalCategory, string> = {
  herb: '한약',
  diet: '다이어트',
  special_herb: '특수한약',
  chuna: '추나',
};

export const linkBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--color-muted)',
  fontSize: 12,
  fontWeight: 600,
  padding: 0,
};

export const smallBtn: CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid var(--color-line)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-ink)',
};

export function formatAmount(n: number | null): string {
  return n != null ? `${n.toLocaleString()}원` : '-';
}

/** 월 선택 표시: 2026-09 -> 2026년 9월 */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}년 ${Number(m)}월`;
}

/** "2026-09-21" → "26-09-21" (연도 앞 두 자리를 뺀다). 형식이 다르면 그대로. */
export function shortDate(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(2) : date;
}

/** "2026-10-07" → "10/7" */
export function monthDay(date: string): string {
  const m = date.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : date;
}
