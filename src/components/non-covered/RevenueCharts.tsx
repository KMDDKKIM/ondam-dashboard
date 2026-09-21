'use client';

import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { availableMonths, changeText, compareMonthsByProduct, monthlyRevenue, niceTicks, recentMonths, shortWon } from '@/lib/nonCoveredStats';
import type { NonCoveredPurchase } from '@/lib/types';
import { formatAmount, monthLabel } from './shared';

interface Props {
  purchases: NonCoveredPurchase[];
  /** 한국 기준 이번 달 YYYY-MM */
  currentMonth: string;
  /** 지금 골라 둔 달 (아래 "월별 현황" 표와 함께 바뀐다) */
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
}

// 선택한 달 = 파랑, 비교하는 달 = 주황 (검증된 두 색: 색약에서도 구분, 배경 대비 3:1 이상). 나머지 달은 파랑을 옅게.
const COLOR_A = '#2a78d6';
const COLOR_B = '#eb6834';
const COLOR_MUTED = 'rgba(42, 120, 214, 0.28)';

const MAX_PRODUCT_ROWS = 8;

interface Tip {
  chart: 'months' | 'products';
  x: number;
  y: number;
  lines: string[];
}

function shortMonth(month: string): string {
  return `${Number(month.slice(5))}월`;
}

function previousMonth(month: string): string {
  return recentMonths(month, 2)[1];
}

// 위쪽 모서리만 4px 둥근 막대(밑은 기준선에 딱 붙는다).
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

const pillStyle = (active: boolean) =>
  ({
    padding: '5px 12px',
    borderRadius: 999,
    border: '1px solid var(--color-line)',
    background: active ? 'var(--color-brand-b)' : 'var(--color-surface)',
    color: active ? '#fff' : 'var(--color-ink)',
    fontSize: 12,
    fontWeight: 600,
  }) as const;

export function RevenueCharts({ purchases, currentMonth, selectedMonth, onSelectMonth }: Props) {
  const [range, setRange] = useState<6 | 12>(6);
  const [showTable, setShowTable] = useState(false);
  const [compareChoice, setCompareChoice] = useState<string | null>(null); // null = 선택한 달의 지난달
  const [tip, setTip] = useState<Tip | null>(null);

  const monthsAvailable = useMemo(() => availableMonths(purchases, currentMonth), [purchases, currentMonth]);
  const chartMonth = selectedMonth === 'all' ? currentMonth : selectedMonth;
  const compareMonth = compareChoice === 'none' ? null : compareChoice && compareChoice !== chartMonth ? compareChoice : previousMonth(chartMonth);

  // 그래프 끝은 이번 달과 선택한 달 중 더 늦은 달.
  const endMonth = chartMonth > currentMonth ? chartMonth : currentMonth;
  // 비교할 달 목록: 기록이 있는 달 + 선택한 달의 지난달(기록이 없어도 고를 수 있게), 선택한 달은 뺀다.
  const compareOptions = Array.from(new Set([...monthsAvailable, previousMonth(chartMonth)]))
    .filter((m) => m !== chartMonth)
    .sort((a, b) => b.localeCompare(a));
  const series = useMemo(() => monthlyRevenue(purchases, endMonth, range), [purchases, endMonth, range]);
  const comparison = useMemo(
    () => (compareMonth ? compareMonthsByProduct(purchases, chartMonth, compareMonth) : []),
    [purchases, chartMonth, compareMonth]
  );

  if (purchases.length === 0) return null;

  // ── 월별 막대 그래프 ─────────────────────────────
  const W = 720;
  const H = 250;
  const M = { top: 22, right: 12, bottom: 38, left: 46 };
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const maxTotal = Math.max(...series.map((s) => s.total), 0);
  const ticks = niceTicks(maxTotal, 4);
  const yMax = ticks[ticks.length - 1];
  const slot = plotW / series.length;
  const barW = Math.min(46, slot * 0.6);
  const yOf = (v: number) => M.top + plotH - (v / yMax) * plotH;

  function showTip(event: MouseEvent<SVGElement>, chart: Tip['chart'], lines: string[]) {
    const box = event.currentTarget.ownerSVGElement?.parentElement?.getBoundingClientRect();
    if (!box) return;
    setTip({ chart, x: event.clientX - box.left, y: event.clientY - box.top, lines });
  }

  function monthLines(s: (typeof series)[number]): string[] {
    const lines = [monthLabel(s.month), s.count === 0 ? '기록 없음' : `${formatAmount(s.total)} · ${s.count}건`];
    if (s.missingAmount > 0) lines.push(`금액 미입력 ${s.missingAmount}건 (합계에서 제외)`);
    return lines;
  }

  function keyActivate(event: KeyboardEvent<SVGElement>, month: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectMonth(month);
    }
  }

  const compareRevenue = series.find((s) => s.month === compareMonth);
  const selectedRevenue = series.find((s) => s.month === chartMonth);

  // ── 상품별 비교 그래프 ────────────────────────────
  const shown = comparison.slice(0, MAX_PRODUCT_ROWS);
  const hidden = comparison.length - shown.length;
  const CW = 720;
  const rowH = compareMonth ? 44 : 30;
  const CM = { top: 8, right: 96, bottom: 8, left: 132 };
  const CH = CM.top + CM.bottom + shown.length * rowH;
  const cPlotW = CW - CM.left - CM.right;
  const cMax = Math.max(...shown.flatMap((p) => [p.a.total, compareMonth ? p.b.total : 0]), 1);
  const wOf = (v: number) => Math.max(v > 0 ? 3 : 0, (v / cMax) * cPlotW);

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 700 }}>월별 매출 그래프</div>
        <span className="muted-text" style={{ fontSize: 12 }}>
          막대를 누르면 그 달의 상품별 매출이 아래에 나와요
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setRange(6)} style={pillStyle(range === 6)}>
            6개월
          </button>
          <button type="button" onClick={() => setRange(12)} style={pillStyle(range === 12)}>
            12개월
          </button>
          <button type="button" onClick={() => setShowTable((v) => !v)} style={pillStyle(showTable)}>
            표로 보기
          </button>
        </span>
      </div>

      <div style={{ display: 'flex', gap: 14, fontSize: 12, margin: '6px 0 4px', flexWrap: 'wrap' }} aria-label="범례">
        <span>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: COLOR_A, borderRadius: 2, marginRight: 5 }} />
          선택한 달 {shortMonth(chartMonth)}
        </span>
        {compareMonth && (
          <span>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: COLOR_B, borderRadius: 2, marginRight: 5 }} />
            비교하는 달 {shortMonth(compareMonth)}
          </span>
        )}
        <span className="muted-text">금액을 입력한 구매만 매출로 계산해요</span>
      </div>

      {showTable ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-2)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>월</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>매출</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>건수</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((s) => (
                <tr key={s.month} style={{ borderTop: '1px solid var(--color-line)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <button type="button" onClick={() => onSelectMonth(s.month)} style={{ border: 'none', background: 'transparent', fontWeight: s.month === chartMonth ? 700 : 500, padding: 0, color: 'var(--color-ink)' }}>
                      {monthLabel(s.month)}
                    </button>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.count === 0 ? '-' : formatAmount(s.total)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right' }}>{s.count}건</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative' }} onMouseLeave={() => setTip(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="월별 비급여 매출 막대 그래프" style={{ width: '100%', height: 'auto', display: 'block' }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={W - M.right} y1={yOf(t)} y2={yOf(t)} stroke="var(--color-line)" strokeWidth={t === 0 ? 1.5 : 1} />
                <text x={M.left - 8} y={yOf(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)">
                  {shortWon(t)}
                </text>
              </g>
            ))}
            {series.map((s, i) => {
              const cx = M.left + slot * i + slot / 2;
              const isSelected = s.month === chartMonth;
              const isCompare = s.month === compareMonth;
              const h = (s.total / yMax) * plotH;
              const fill = isSelected ? COLOR_A : isCompare ? COLOR_B : COLOR_MUTED;
              const year = s.month.slice(2, 4);
              const showYear = i === 0 || s.month.endsWith('-01');
              return (
                <g key={s.month}>
                  {s.total > 0 && <path d={barPath(cx - barW / 2, M.top + plotH - h, barW, h)} fill={fill} />}
                  {s.total === 0 && <rect x={cx - barW / 2} y={M.top + plotH - 1.5} width={barW} height={1.5} fill="var(--color-line)" />}
                  {(isSelected || isCompare) && s.total > 0 && (
                    <text x={cx} y={M.top + plotH - h - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-ink)">
                      {shortWon(s.total)}
                    </text>
                  )}
                  <text x={cx} y={H - M.bottom + 16} textAnchor="middle" fontSize={12} fontWeight={isSelected ? 700 : 500} fill={isSelected ? 'var(--color-ink)' : 'var(--color-muted)'}>
                    {shortMonth(s.month)}
                  </text>
                  {showYear && (
                    <text x={cx} y={H - M.bottom + 30} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
                      {`'${year}`}
                    </text>
                  )}
                  {/* 막대보다 넉넉한 눌러지는 영역(달 하나 전체 칸) */}
                  <rect
                    x={cx - slot / 2}
                    y={M.top}
                    width={slot}
                    height={plotH + M.bottom}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${monthLabel(s.month)} ${s.count === 0 ? '기록 없음' : `${formatAmount(s.total)}, ${s.count}건`}`}
                    aria-pressed={isSelected}
                    onClick={() => onSelectMonth(s.month)}
                    onKeyDown={(e) => keyActivate(e, s.month)}
                    onMouseMove={(e) => showTip(e, 'months', monthLines(s))}
                  />
                </g>
              );
            })}
          </svg>
          {tip && tip.chart === 'months' && tip.lines.length > 0 && (
            <div
              role="tooltip"
              style={{
                position: 'absolute',
                left: Math.min(tip.x + 12, 520),
                top: Math.max(tip.y - 8, 0),
                background: 'var(--color-ink)',
                color: '#fff',
                borderRadius: 8,
                padding: '6px 10px',
                fontSize: 12,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                lineHeight: 1.5,
              }}
            >
              {tip.lines.map((l, i) => (
                <div key={i} style={{ fontWeight: i === 0 ? 700 : 400 }}>
                  {l}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 상품별 비교 ── */}
      <div style={{ borderTop: '1px solid var(--color-line)', marginTop: 16, paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <div style={{ fontWeight: 700 }}>
            {shortMonth(chartMonth)} 상품별 매출{compareMonth ? ` — ${shortMonth(compareMonth)}와 비교` : ''}
          </div>
          <label className="muted-text" style={{ fontSize: 12, marginLeft: 'auto' }}>
            비교하는 달{' '}
            <select
              value={compareMonth ?? 'none'}
              onChange={(e) => setCompareChoice(e.target.value)}
              className="input-field"
              style={{ maxWidth: 150, display: 'inline-block', padding: '5px 8px', fontSize: 12 }}
            >
              <option value="none">비교 안 함</option>
              {compareOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedRevenue && (
          <p className="muted-text" style={{ fontSize: 13, margin: '0 0 8px' }}>
            {shortMonth(chartMonth)} 매출 {selectedRevenue.count === 0 ? '없음' : formatAmount(selectedRevenue.total)}
            {compareMonth && compareRevenue && (
              <>
                {' · '}
                {shortMonth(compareMonth)} 매출 {compareRevenue.count === 0 ? '없음' : formatAmount(compareRevenue.total)}
                {' · '}
                <strong style={{ color: 'var(--color-ink)' }}>{changeText(selectedRevenue.total, compareRevenue.total)}</strong>
              </>
            )}
          </p>
        )}

        {shown.length === 0 ? (
          <p className="muted-text" style={{ fontSize: 13 }}>
            이 달의 기록이 없어요.
          </p>
        ) : (
          <>
            <div style={{ position: 'relative' }} onMouseLeave={() => setTip(null)}>
              <svg viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="상품별 매출 비교 막대 그래프" style={{ width: '100%', height: 'auto', display: 'block' }}>
                {shown.map((p, i) => {
                  const y = CM.top + i * rowH;
                  const barH = compareMonth ? 13 : 16;
                  const label = p.product.length > 9 ? `${p.product.slice(0, 9)}…` : p.product;
                  const tipLines = [p.product, `${shortMonth(chartMonth)}: ${formatAmount(p.a.total)} · ${p.a.count}건`, ...(compareMonth ? [`${shortMonth(compareMonth)}: ${formatAmount(p.b.total)} · ${p.b.count}건`, changeText(p.a.total, p.b.total)] : [])];
                  return (
                    <g key={p.product} onMouseMove={(e) => showTip(e as unknown as MouseEvent<SVGElement>, 'products', tipLines)}>
                      <text x={CM.left - 10} y={y + rowH / 2 + 4} textAnchor="end" fontSize={12} fill="var(--color-ink)">
                        {label}
                      </text>
                      <rect x={CM.left} y={y + 4} width={wOf(p.a.total)} height={barH} rx={3} fill={COLOR_A} />
                      <text x={CM.left + wOf(p.a.total) + 6} y={y + 4 + barH - 2} fontSize={11} fill="var(--color-muted)">
                        {p.a.total > 0 ? shortWon(p.a.total) : p.a.count > 0 ? '금액 미입력' : '-'}
                      </text>
                      {compareMonth && (
                        <>
                          <rect x={CM.left} y={y + 4 + barH + 3} width={wOf(p.b.total)} height={barH} rx={3} fill={COLOR_B} />
                          <text x={CM.left + wOf(p.b.total) + 6} y={y + 4 + barH + 3 + barH - 2} fontSize={11} fill="var(--color-muted)">
                            {p.b.total > 0 ? shortWon(p.b.total) : p.b.count > 0 ? '금액 미입력' : '-'}
                          </text>
                        </>
                      )}
                      {/* 행 전체가 호버 영역 */}
                      <rect x={0} y={y} width={CW} height={rowH} fill="transparent" />
                    </g>
                  );
                })}
              </svg>
              {tip && tip.chart === 'products' && tip.lines.length > 0 && (
                <div
                  role="tooltip"
                  style={{
                    position: 'absolute',
                    left: Math.min(tip.x + 12, 480),
                    top: Math.max(tip.y - 8, 0),
                    background: 'var(--color-ink)',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: 12,
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.5,
                  }}
                >
                  {tip.lines.map((l, i) => (
                    <div key={i} style={{ fontWeight: i === 0 ? 700 : 400 }}>
                      {l}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {hidden > 0 && (
              <p className="muted-text" style={{ fontSize: 12, margin: '4px 0 0' }}>
                그래프에는 매출이 큰 {MAX_PRODUCT_ROWS}개 상품만 보여요(나머지 {hidden}개는 아래 표에서 확인).
              </p>
            )}

            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-2)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left' }}>상품</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>{shortMonth(chartMonth)} 매출</th>
                    {compareMonth && <th style={{ padding: '8px 10px', textAlign: 'right' }}>{shortMonth(compareMonth)} 매출</th>}
                    {compareMonth && <th style={{ padding: '8px 10px', textAlign: 'right' }}>증감</th>}
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((p) => (
                    <tr key={p.product} style={{ borderTop: '1px solid var(--color-line)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.product}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {p.a.count === 0 ? '-' : `${p.a.pricedCount > 0 ? formatAmount(p.a.total) : '금액 미입력'} · ${p.a.count}건`}
                      </td>
                      {compareMonth && (
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          {p.b.count === 0 ? '-' : `${p.b.pricedCount > 0 ? formatAmount(p.b.total) : '금액 미입력'} · ${p.b.count}건`}
                        </td>
                      )}
                      {compareMonth && <td style={{ padding: '8px 10px', textAlign: 'right' }}>{changeText(p.a.total, p.b.total)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
