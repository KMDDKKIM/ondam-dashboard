'use client';

import { useMemo } from 'react';
import { monthlyTable, type Stat } from '@/lib/nonCoveredStats';
import type { NonCoveredPurchase } from '@/lib/types';
import { formatAmount, monthLabel } from './shared';

interface Props {
  purchases: NonCoveredPurchase[];
  /** 마지막(가장 최근) 달 YYYY-MM */
  currentMonth: string;
}

const th = { padding: '11px 12px', textAlign: 'right' } as const;
const td = { padding: '11px 12px', textAlign: 'right' } as const;

function Cell({ stat }: { stat: Stat }) {
  if (stat.count === 0) return <>-</>;
  return (
    <>
      {stat.count}건 / {formatAmount(stat.pricedCount > 0 ? stat.total : null)}
      {stat.missingAmount > 0 && (
        <span className="muted-text" style={{ fontSize: 11, marginLeft: 6, whiteSpace: 'nowrap' }}>
          금액 미입력 {stat.missingAmount}건
        </span>
      )}
    </>
  );
}

/** 최근 6개월 x 구분별 건수/금액. */
export function MonthlyTrend({ purchases, currentMonth }: Props) {
  const table = useMemo(() => monthlyTable(purchases, currentMonth, 6), [purchases, currentMonth]);
  if (table.months.every((m) => m.total.count === 0)) return null;

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20, overflowX: 'auto' }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>최근 6개월 추이</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
        <thead>
          <tr style={{ background: 'var(--color-surface-2)' }}>
            <th style={{ ...th, textAlign: 'left' }}>월</th>
            {table.categories.length > 1 &&
              table.categories.map((c) => (
                <th key={c} style={th}>
                  {c}
                </th>
              ))}
            <th style={th}>전체</th>
          </tr>
        </thead>
        <tbody>
          {table.months.map((m) => (
            <tr key={m.month} style={{ borderTop: '1px solid var(--color-line)' }}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{monthLabel(m.month)}</td>
              {table.categories.length > 1 &&
                table.categories.map((c) => (
                  <td key={c} style={td}>
                    <Cell stat={m.byCategory[c]} />
                  </td>
                ))}
              <td style={{ ...td, fontWeight: 600 }}>
                <Cell stat={m.total} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
