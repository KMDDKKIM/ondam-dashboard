'use client';

import { useEffect, useMemo, useState } from 'react';
import { compareCategories, type ComparisonSide, type DateWindow, type Stat } from '@/lib/nonCoveredStats';
import type { NonCoveredPurchase } from '@/lib/types';
import { formatAmount } from './shared';

interface Props {
  purchases: NonCoveredPurchase[];
  categories: string[];
  eventCategories: string[];
}

const th = { padding: '11px 12px', textAlign: 'right' } as const;
const td = { padding: '11px 12px', textAlign: 'right' } as const;

function StatText({ stat }: { stat: Stat | undefined }) {
  if (!stat || stat.count === 0) return <>-</>;
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

function spanText(side: ComparisonSide): string {
  return side.span ? `${side.span.from} ~ ${side.span.to}` : '기록 없음';
}

export function EventComparison({ purchases, categories, eventCategories }: Props) {
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [customRange, setCustomRange] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // 이벤트가 생기면 가장 최근 두 개(하나면 그것)를 미리 골라 둔다.
  useEffect(() => {
    if (eventCategories.length >= 2 && !compareA && !compareB) {
      setCompareA(eventCategories[eventCategories.length - 2]);
      setCompareB(eventCategories[eventCategories.length - 1]);
    } else if (eventCategories.length === 1 && !compareA) {
      setCompareA(eventCategories[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventCategories]);

  const override = useMemo<DateWindow | null>(
    () => (customRange && from && to && from <= to ? { from, to } : null),
    [customRange, from, to]
  );
  const comparison = useMemo(
    () => compareCategories(purchases, compareA, compareB, override),
    [purchases, compareA, compareB, override]
  );

  const sides = [comparison.a, comparison.b].filter((s): s is ComparisonSide => s !== null);

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>📊 이벤트 실적 비교</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={compareA} onChange={(e) => setCompareA(e.target.value)} className="input-field" style={{ maxWidth: 180 }}>
          <option value="">선택 안 함</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="muted-text">vs</span>
        <select value={compareB} onChange={(e) => setCompareB(e.target.value)} className="input-field" style={{ maxWidth: 180 }}>
          <option value="">선택 안 함</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={customRange} onChange={(e) => setCustomRange(e.target.checked)} />
          기간 직접 지정
        </label>
        {customRange && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input-field" style={{ maxWidth: 150 }} />
            <span className="muted-text">~</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input-field" style={{ maxWidth: 150 }} />
          </>
        )}
      </div>

      {sides.length > 0 && (
        <p className="muted-text" style={{ fontSize: 12, marginBottom: 12 }}>
          {comparison.window
            ? `비교 기간(양쪽 동일): ${comparison.window.from} ~ ${comparison.window.to}${
                override ? '' : ' — 일반은 이벤트가 진행된 기간의 구매만 셉니다.'
              }`
            : `각 구분의 전체 기간 — ${sides.map((s) => `${s.category}: ${spanText(s)}`).join(' / ')}`}
        </p>
      )}

      {sides.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-2)' }}>
                <th style={{ ...th, textAlign: 'left' }}>상품명</th>
                {sides.map((s) => (
                  <th key={s.category} style={th}>
                    {s.category} 건수/금액
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.products.map((product) => (
                <tr key={product} style={{ borderTop: '1px solid var(--color-line)' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{product}</td>
                  {sides.map((s) => (
                    <td key={s.category} style={td}>
                      <StatText stat={s.byProduct[product]} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--color-line)', fontWeight: 700 }}>
                <td style={{ ...td, textAlign: 'left' }}>합계</td>
                {sides.map((s) => (
                  <td key={s.category} style={td}>
                    <StatText stat={s.total} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
