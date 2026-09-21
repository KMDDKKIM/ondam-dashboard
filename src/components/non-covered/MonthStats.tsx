'use client';

import { useMemo, useState } from 'react';
import {
  ALL_MONTHS,
  availableMonths,
  crossTabByCategory,
  filterByMonth,
  makeStat,
  productStats,
  type Stat,
} from '@/lib/nonCoveredStats';
import type { NonCoveredPurchase } from '@/lib/types';
import { formatAmount, monthLabel } from './shared';

interface Props {
  purchases: NonCoveredPurchase[];
  /** 기본 선택 달 (YYYY-MM, 한국 기준 이번 달) */
  currentMonth: string;
}

const th = { padding: '8px 10px', textAlign: 'right' } as const;
const td = { padding: '8px 10px', textAlign: 'right' } as const;

/** 금액을 입력하지 않은 건수 표시(평균/총액에서는 빠져 있다). */
function MissingNote({ stat }: { stat: Stat }) {
  if (stat.missingAmount === 0) return null;
  return (
    <span className="muted-text" style={{ fontSize: 11, marginLeft: 6, whiteSpace: 'nowrap' }}>
      금액 미입력 {stat.missingAmount}건
    </span>
  );
}

function CountAmount({ stat }: { stat: Stat }) {
  if (stat.count === 0) return <>-</>;
  return (
    <>
      {stat.count}건 / {formatAmount(stat.pricedCount > 0 ? stat.total : null)}
      <MissingNote stat={stat} />
    </>
  );
}

export function MonthStats({ purchases, currentMonth }: Props) {
  const [month, setMonth] = useState(currentMonth);

  const months = useMemo(() => availableMonths(purchases, currentMonth), [purchases, currentMonth]);
  const rows = useMemo(() => filterByMonth(purchases, month), [purchases, month]);
  const byProduct = useMemo(() => productStats(rows), [rows]);
  const crossTab = useMemo(() => crossTabByCategory(rows), [rows]);
  const total = useMemo(() => makeStat(rows), [rows]);

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>월별 현황</div>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="input-field" style={{ maxWidth: 160 }}>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
          <option value={ALL_MONTHS}>전체</option>
        </select>
        <span className="muted-text">
          {total.count}건 · 총액 {formatAmount(total.pricedCount > 0 ? total.total : null)}
          {total.missingAmount > 0 && ` · 금액 미입력 ${total.missingAmount}건(총액/평균 제외)`}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="muted-text">이 기간의 기록이 없어요.</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>상품별</th>
                  <th style={th}>건수</th>
                  <th style={th}>총액</th>
                  <th style={th}>평균단가</th>
                </tr>
              </thead>
              <tbody>
                {byProduct.map((s) => (
                  <tr key={s.product} style={{ borderTop: '1px solid var(--color-line)' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{s.product}</td>
                    <td style={td}>{s.count}건</td>
                    <td style={td}>{formatAmount(s.pricedCount > 0 ? s.total : null)}</td>
                    <td style={td}>
                      {formatAmount(s.average)}
                      <MissingNote stat={s} />
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--color-line)', fontWeight: 700 }}>
                  <td style={{ ...td, textAlign: 'left' }}>합계</td>
                  <td style={td}>{total.count}건</td>
                  <td style={td}>{formatAmount(total.pricedCount > 0 ? total.total : null)}</td>
                  <td style={td}>{formatAmount(total.average)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {crossTab.categories.length > 1 && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>구분별 (일반 / 이벤트) 나란히 보기</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-2)' }}>
                    <th style={{ ...th, textAlign: 'left' }}>상품</th>
                    {crossTab.categories.map((c) => (
                      <th key={c} style={th}>
                        {c} 건수/금액
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {crossTab.rows.map((r) => (
                    <tr key={r.product} style={{ borderTop: '1px solid var(--color-line)' }}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{r.product}</td>
                      {crossTab.categories.map((c) => (
                        <td key={c} style={td}>
                          <CountAmount stat={r.byCategory[c]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--color-line)', fontWeight: 700 }}>
                    <td style={{ ...td, textAlign: 'left' }}>합계</td>
                    {crossTab.categories.map((c) => (
                      <td key={c} style={td}>
                        <CountAmount stat={crossTab.totalByCategory[c]} />
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
