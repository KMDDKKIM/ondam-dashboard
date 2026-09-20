// 비급여 현황 집계(순수 함수). DB/화면과 무관하게 구매 행 목록만 받아 계산한다.
// 금액을 입력하지 않은 행(amount == null)은 건수에는 세되, 총액/평균단가 계산에서는 빼고
// "금액 미입력 N건"으로 따로 센다.

import type { NonCoveredPurchase } from './types';

export type StatRow = Pick<NonCoveredPurchase, 'category' | 'productName' | 'amount' | 'purchaseDate'>;

export const GENERAL_CATEGORY = '일반';
/** 월 선택에서 "전체". */
export const ALL_MONTHS = 'all';

export interface Stat {
  /** 전체 건수(금액 미입력 포함) */
  count: number;
  /** 금액이 입력된 건수(평균단가의 분모) */
  pricedCount: number;
  /** 금액 미입력 건수 */
  missingAmount: number;
  /** 금액이 입력된 행의 합계 */
  total: number;
  /** 평균단가(원 단위 반올림). 금액이 입력된 행이 없으면 null */
  average: number | null;
}

export function makeStat(rows: readonly Pick<StatRow, 'amount'>[]): Stat {
  let total = 0;
  let pricedCount = 0;
  for (const row of rows) {
    if (row.amount != null) {
      total += row.amount;
      pricedCount += 1;
    }
  }
  return {
    count: rows.length,
    pricedCount,
    missingAmount: rows.length - pricedCount,
    total,
    average: pricedCount > 0 ? Math.round(total / pricedCount) : null,
  };
}

// --- 월 ---

/** YYYY-MM-DD -> YYYY-MM */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** endMonth(YYYY-MM)부터 거꾸로 n개월. 최신 달이 앞. */
export function recentMonths(endMonth: string, n: number): string[] {
  const [y, m] = endMonth.split('-').map(Number);
  const months: string[] = [];
  for (let i = 0; i < n; i++) {
    const index = y * 12 + (m - 1) - i;
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }
  return months;
}

/** month 가 ALL_MONTHS 이면 전부, 아니면 그 달(YYYY-MM)의 구매만. */
export function filterByMonth<T extends Pick<StatRow, 'purchaseDate'>>(rows: readonly T[], month: string): T[] {
  return month === ALL_MONTHS ? [...rows] : rows.filter((r) => monthOf(r.purchaseDate) === month);
}

/** 데이터에 있는 달(최신순) — 월 선택 목록. 현재 달은 데이터가 없어도 항상 포함한다. */
export function availableMonths(rows: readonly Pick<StatRow, 'purchaseDate'>[], currentMonth: string): string[] {
  const set = new Set<string>([currentMonth]);
  rows.forEach((r) => set.add(monthOf(r.purchaseDate)));
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

// --- 구분(일반/이벤트) ---

/** 일반이 맨 앞, 나머지는 이름순(26추석 -> 27설 처럼 연도 접두어라 시간순이 된다). */
export function orderCategories(rows: readonly Pick<StatRow, 'category'>[]): string[] {
  const set = new Set<string>(rows.map((r) => r.category));
  const events = Array.from(set)
    .filter((c) => c !== GENERAL_CATEGORY)
    .sort((a, b) => a.localeCompare(b));
  return set.has(GENERAL_CATEGORY) ? [GENERAL_CATEGORY, ...events] : events;
}

// --- 상품별 ---

export interface ProductStat extends Stat {
  product: string;
}

/** 상품별 건수/총액/평균단가. 건수 많은 순, 같으면 이름순. */
export function productStats(rows: readonly StatRow[]): ProductStat[] {
  const groups = new Map<string, StatRow[]>();
  for (const row of rows) {
    const list = groups.get(row.productName) ?? [];
    list.push(row);
    groups.set(row.productName, list);
  }
  return Array.from(groups, ([product, list]) => ({ product, ...makeStat(list) })).sort(
    (a, b) => b.count - a.count || a.product.localeCompare(b.product)
  );
}

export interface CrossTabRow {
  product: string;
  total: Stat;
  byCategory: Record<string, Stat>;
}

export interface CrossTab {
  categories: string[];
  rows: CrossTabRow[];
  total: Stat;
  totalByCategory: Record<string, Stat>;
}

/** 상품 x 구분 표 — 일반과 각 이벤트를 나란히 볼 수 있게 한다. */
export function crossTabByCategory(rows: readonly StatRow[]): CrossTab {
  const categories = orderCategories(rows);
  const byProduct = new Map<string, StatRow[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productName) ?? [];
    list.push(row);
    byProduct.set(row.productName, list);
  }
  const statsByCategory = (list: readonly StatRow[]) =>
    Object.fromEntries(categories.map((c) => [c, makeStat(list.filter((r) => r.category === c))]));

  const tabRows = Array.from(byProduct, ([product, list]) => ({
    product,
    total: makeStat(list),
    byCategory: statsByCategory(list),
  })).sort((a, b) => b.total.count - a.total.count || a.product.localeCompare(b.product));

  return { categories, rows: tabRows, total: makeStat(rows), totalByCategory: statsByCategory(rows) };
}

// --- 월별 추이 ---

export interface MonthlyRow {
  month: string;
  total: Stat;
  byCategory: Record<string, Stat>;
}

export interface MonthlyTable {
  categories: string[];
  months: MonthlyRow[];
}

/** endMonth 까지 최근 n개월(기본 6)의 구분별 건수/금액. 최신 달이 앞. */
export function monthlyTable(rows: readonly StatRow[], endMonth: string, n = 6): MonthlyTable {
  const monthKeys = recentMonths(endMonth, n);
  const inRange = rows.filter((r) => monthKeys.includes(monthOf(r.purchaseDate)));
  const categories = orderCategories(inRange);
  const months = monthKeys.map((month) => {
    const monthRows = inRange.filter((r) => monthOf(r.purchaseDate) === month);
    return {
      month,
      total: makeStat(monthRows),
      byCategory: Object.fromEntries(
        categories.map((c) => [c, makeStat(monthRows.filter((r) => r.category === c))])
      ),
    };
  });
  return { categories, months };
}

// --- 구분 간 비교 (이벤트 실적 비교) ---

export interface DateWindow {
  from: string;
  to: string;
}

/** 그 구분의 구매가 있는 기간(첫 구매일 ~ 마지막 구매일). 구매가 없으면 null. */
export function categorySpan(rows: readonly StatRow[], category: string): DateWindow | null {
  let from: string | null = null;
  let to: string | null = null;
  for (const row of rows) {
    if (row.category !== category) continue;
    if (from === null || row.purchaseDate < from) from = row.purchaseDate;
    if (to === null || row.purchaseDate > to) to = row.purchaseDate;
  }
  return from && to ? { from, to } : null;
}

export function inWindow(row: Pick<StatRow, 'purchaseDate'>, window: DateWindow | null): boolean {
  return window === null || (row.purchaseDate >= window.from && row.purchaseDate <= window.to);
}

/**
 * 비교에 쓸 기간.
 *  - 직접 지정한 기간(override)이 있으면 양쪽에 그 기간을 쓴다.
 *  - 한쪽이 일반이고 다른 쪽이 이벤트면, 일반을 "전체 기간"이 아니라 이벤트가 진행된 기간으로 잘라
 *    같은 기간끼리 비교한다.
 *  - 그 밖(이벤트끼리, 일반끼리)은 각자의 전체 구매를 비교하므로 null.
 */
export function comparisonWindow(
  rows: readonly StatRow[],
  a: string,
  b: string,
  override?: DateWindow | null
): DateWindow | null {
  if (override) return override;
  if (a === GENERAL_CATEGORY && b !== GENERAL_CATEGORY && b) return categorySpan(rows, b);
  if (b === GENERAL_CATEGORY && a !== GENERAL_CATEGORY && a) return categorySpan(rows, a);
  return null;
}

export interface ComparisonSide {
  category: string;
  /** 비교에 실제로 들어간 구매의 첫/마지막 날짜 (없으면 null) */
  span: DateWindow | null;
  total: Stat;
  byProduct: Record<string, Stat>;
}

export interface CategoryComparison {
  /** 양쪽에 똑같이 적용한 기간. null 이면 각자의 전체 구매 */
  window: DateWindow | null;
  products: string[];
  a: ComparisonSide | null;
  b: ComparisonSide | null;
}

function buildSide(rows: readonly StatRow[], category: string, window: DateWindow | null): ComparisonSide | null {
  if (!category) return null;
  const sideRows = rows.filter((r) => r.category === category && inWindow(r, window));
  const byProduct: Record<string, Stat> = {};
  for (const [product, list] of groupBy(sideRows, (r) => r.productName)) byProduct[product] = makeStat(list);
  return { category, span: categorySpan(sideRows, category), total: makeStat(sideRows), byProduct };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

export function compareCategories(
  rows: readonly StatRow[],
  a: string,
  b: string,
  override?: DateWindow | null
): CategoryComparison {
  const window = comparisonWindow(rows, a, b, override);
  const sideA = buildSide(rows, a, window);
  const sideB = buildSide(rows, b, window);
  const names = new Set<string>([...Object.keys(sideA?.byProduct ?? {}), ...Object.keys(sideB?.byProduct ?? {})]);
  return { window, products: Array.from(names).sort((x, y) => x.localeCompare(y)), a: sideA, b: sideB };
}
