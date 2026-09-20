import { describe, expect, it } from 'vitest';
import {
  ALL_MONTHS,
  availableMonths,
  categorySpan,
  compareCategories,
  comparisonWindow,
  crossTabByCategory,
  filterByMonth,
  makeStat,
  monthlyTable,
  orderCategories,
  productStats,
  recentMonths,
  type StatRow,
} from './nonCoveredStats';

function row(category: string, productName: string, amount: number | null, purchaseDate: string): StatRow {
  return { category, productName, amount, purchaseDate };
}

const rows: StatRow[] = [
  row('일반', '공진단', 300000, '2026-09-03'),
  row('일반', '공진단', 500000, '2026-09-20'),
  row('일반', '경옥고', null, '2026-09-10'),
  row('일반', '공진단', 400000, '2026-05-05'),
  row('일반', '공진단', 100000, '2025-01-15'),
  row('26추석이벤트', '공진단', 250000, '2026-09-05'),
  row('26추석이벤트', '경옥고', 150000, '2026-09-12'),
  row('26추석이벤트', '경옥고', null, '2026-09-14'),
];

describe('makeStat', () => {
  it('금액 미입력 행은 건수에만 세고 총액/평균에서 뺀다', () => {
    expect(makeStat([{ amount: 100 }, { amount: 300 }, { amount: null }])).toEqual({
      count: 3,
      pricedCount: 2,
      missingAmount: 1,
      total: 400,
      average: 200,
    });
  });

  it('금액이 하나도 없으면 평균은 null', () => {
    expect(makeStat([{ amount: null }])).toEqual({ count: 1, pricedCount: 0, missingAmount: 1, total: 0, average: null });
    expect(makeStat([]).average).toBeNull();
  });

  it('평균은 원 단위로 반올림한다', () => {
    expect(makeStat([{ amount: 100 }, { amount: 101 }]).average).toBe(101);
  });

  it('금액 0원은 입력된 값으로 본다', () => {
    expect(makeStat([{ amount: 0 }, { amount: 100 }])).toMatchObject({ pricedCount: 2, average: 50 });
  });
});

describe('months', () => {
  it('recentMonths 는 연도를 넘어 최신 달부터 n개월', () => {
    expect(recentMonths('2026-02', 4)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
    expect(recentMonths('2026-09', 6)).toEqual(['2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04']);
  });

  it('filterByMonth: 달 또는 전체', () => {
    expect(filterByMonth(rows, '2026-09')).toHaveLength(6);
    expect(filterByMonth(rows, '2026-05')).toHaveLength(1);
    expect(filterByMonth(rows, ALL_MONTHS)).toHaveLength(rows.length);
  });

  it('availableMonths 는 현재 달을 데이터가 없어도 넣고 최신순', () => {
    expect(availableMonths(rows, '2026-10')).toEqual(['2026-10', '2026-09', '2026-05', '2025-01']);
    expect(availableMonths([], '2026-09')).toEqual(['2026-09']);
  });
});

describe('orderCategories', () => {
  it('일반이 먼저, 이벤트는 이름순', () => {
    const list = [row('27설이벤트', 'a', 1, '2027-01-01'), row('26추석이벤트', 'a', 1, '2026-09-01'), row('일반', 'a', 1, '2026-09-01')];
    expect(orderCategories(list)).toEqual(['일반', '26추석이벤트', '27설이벤트']);
  });
});

describe('productStats', () => {
  it('선택한 달의 상품별 건수/총액/평균단가와 금액 미입력 건수', () => {
    const stats = productStats(filterByMonth(rows, '2026-09'));
    const gongjin = stats.find((s) => s.product === '공진단')!;
    expect(gongjin).toMatchObject({ count: 3, total: 1050000, average: 350000, missingAmount: 0 });
    const okgo = stats.find((s) => s.product === '경옥고')!;
    expect(okgo).toMatchObject({ count: 3, pricedCount: 1, total: 150000, average: 150000, missingAmount: 2 });
  });

  it('전체 기간과 건수 많은 순 정렬', () => {
    const stats = productStats(rows);
    expect(stats[0].product).toBe('공진단');
    expect(stats[0].count).toBe(5);
  });
});

describe('crossTabByCategory', () => {
  it('일반과 이벤트를 나란히 상품별로 센다', () => {
    const tab = crossTabByCategory(filterByMonth(rows, '2026-09'));
    expect(tab.categories).toEqual(['일반', '26추석이벤트']);
    const gongjin = tab.rows.find((r) => r.product === '공진단')!;
    expect(gongjin.byCategory['일반']).toMatchObject({ count: 2, total: 800000, average: 400000 });
    expect(gongjin.byCategory['26추석이벤트']).toMatchObject({ count: 1, total: 250000 });
    expect(tab.totalByCategory['26추석이벤트']).toMatchObject({ count: 3, missingAmount: 1 });
    expect(tab.total.count).toBe(6);
  });
});

describe('monthlyTable', () => {
  it('최근 6개월(데이터 없는 달 포함)의 구분별 건수/금액', () => {
    const table = monthlyTable(rows, '2026-09', 6);
    expect(table.months.map((m) => m.month)).toEqual(['2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04']);
    expect(table.categories).toEqual(['일반', '26추석이벤트']);
    expect(table.months[0].byCategory['일반']).toMatchObject({ count: 3, total: 800000, missingAmount: 1 });
    expect(table.months[0].total.count).toBe(6);
    expect(table.months[1].total.count).toBe(0);
    expect(table.months[4].byCategory['일반']).toMatchObject({ count: 1, total: 400000 });
  });

  it('6개월 밖의 행은 넣지 않는다(2025-01)', () => {
    const table = monthlyTable(rows, '2026-09', 6);
    expect(table.months.reduce((sum, m) => sum + m.total.count, 0)).toBe(7);
  });
});

describe('comparison', () => {
  it('categorySpan 은 첫~마지막 구매일', () => {
    expect(categorySpan(rows, '26추석이벤트')).toEqual({ from: '2026-09-05', to: '2026-09-14' });
    expect(categorySpan(rows, '없음')).toBeNull();
  });

  it('일반 vs 이벤트: 일반도 이벤트 기간으로 잘라 같은 기간끼리 비교한다', () => {
    const cmp = compareCategories(rows, '일반', '26추석이벤트');
    expect(cmp.window).toEqual({ from: '2026-09-05', to: '2026-09-14' });
    // 일반: 09-10 경옥고(금액 없음)만 기간 안. 09-03/09-20/2026-05/2025-01 공진단은 제외.
    expect(cmp.a!.total).toMatchObject({ count: 1, missingAmount: 1, total: 0 });
    expect(cmp.a!.byProduct['공진단']).toBeUndefined();
    expect(cmp.b!.total).toMatchObject({ count: 3, total: 400000 });
    expect(cmp.products).toEqual(['경옥고', '공진단']);
  });

  it('순서를 바꿔도 같은 기간을 적용한다', () => {
    expect(compareCategories(rows, '26추석이벤트', '일반').window).toEqual({ from: '2026-09-05', to: '2026-09-14' });
  });

  it('이벤트끼리 / 일반끼리는 각자의 전체 구매', () => {
    expect(comparisonWindow(rows, '26추석이벤트', '27설이벤트')).toBeNull();
    expect(comparisonWindow(rows, '일반', '일반')).toBeNull();
    expect(compareCategories(rows, '일반', '').a!.total.count).toBe(5);
  });

  it('직접 지정한 기간은 양쪽에 똑같이 적용된다', () => {
    const cmp = compareCategories(rows, '일반', '26추석이벤트', { from: '2026-09-01', to: '2026-09-30' });
    expect(cmp.window).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(cmp.a!.total.count).toBe(3);
    expect(cmp.b!.total.count).toBe(3);
  });
});
