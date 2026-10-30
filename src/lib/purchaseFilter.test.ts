import { describe, expect, it } from 'vitest';
import { ALL_CATEGORIES, defaultGoalFor, exportFileName, filterPurchases, periodRange, purchaseExportRows, summarizePurchases } from './purchaseFilter';
import type { NonCoveredPurchase } from './types';

// 환자·상품은 모두 시험용 가짜 값이다.
const row = (o: Partial<NonCoveredPurchase> = {}): NonCoveredPurchase => ({
  id: 'p1', patientName: '가나다', chartNo: '1001', phone: '010-0000-0001', doctorName: '김원장', category: '일반', productName: '시험상품',
  amount: 100000, purchaseDate: '2026-10-05', memo: null, happyCallDate: null, happyCallEntryId: null, happyCallEntryId2: null, happyCallEntryId3: null,
  durationDays: null, goalCategory: null, createdBy: 'u1', createdAt: '2026-10-05T00:00:00Z', ...o,
});

describe('filterPurchases', () => {
  const rows = [
    row({ id: 'a', category: '일반', purchaseDate: '2026-09-30' }),
    row({ id: 'b', category: '이벤트', purchaseDate: '2026-10-01' }),
    row({ id: 'c', category: '이벤트', purchaseDate: '2026-10-31' }),
    row({ id: 'd', category: '일반', purchaseDate: '2026-11-01' }),
  ];

  it('구분만 걸면 그 구분 전부, 전체면 모두', () => {
    expect(filterPurchases(rows, { category: '이벤트', from: '', to: '' }).map((r) => r.id)).toEqual(['b', 'c']);
    expect(filterPurchases(rows, { category: ALL_CATEGORIES, from: '', to: '' })).toHaveLength(4);
  });

  it('기간은 시작·끝 날짜를 포함한다', () => {
    expect(filterPurchases(rows, { category: ALL_CATEGORIES, from: '2026-10-01', to: '2026-10-31' }).map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('시작만, 끝만 걸 수도 있다', () => {
    expect(filterPurchases(rows, { category: ALL_CATEGORIES, from: '2026-10-31', to: '' }).map((r) => r.id)).toEqual(['c', 'd']);
    expect(filterPurchases(rows, { category: ALL_CATEGORIES, from: '', to: '2026-09-30' }).map((r) => r.id)).toEqual(['a']);
  });

  it('구분과 기간을 함께 걸고, 시작·끝이 뒤바뀌면 바로잡는다', () => {
    expect(filterPurchases(rows, { category: '일반', from: '2026-10-31', to: '2026-09-01' }).map((r) => r.id)).toEqual(['a']);
  });
});

describe('periodRange', () => {
  it('이번 달·지난 달(연초 포함)·올해', () => {
    expect(periodRange('thisMonth', '2026-10-13')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('thisMonth', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('lastMonth', '2026-10-13')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodRange('lastMonth', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodRange('thisYear', '2026-10-13')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('최근 3개월은 오늘이 든 달 포함 석 달의 첫날부터 오늘까지(연초를 넘어도)', () => {
    expect(periodRange('last3Months', '2026-10-13')).toEqual({ from: '2026-08-01', to: '2026-10-13' });
    expect(periodRange('last3Months', '2026-02-10')).toEqual({ from: '2025-12-01', to: '2026-02-10' });
  });

  it('전체 기간은 비운다', () => {
    expect(periodRange('all', '2026-10-13')).toEqual({ from: '', to: '' });
  });
});

describe('summarizePurchases', () => {
  it('건수·합계·금액 미입력 건수', () => {
    expect(summarizePurchases([row({ amount: 100 }), row({ amount: 250 }), row({ amount: null })])).toEqual({ count: 3, total: 350, missingAmount: 1 });
  });
});

describe('purchaseExportRows', () => {
  const name = (id: string | null) => (id === 'u1' ? '김직원' : '(삭제된 직원)');

  it('처방일수가 있으면 해피콜 1·2·3차, 수령일만 있으면 다음날 1회, 없으면 빈칸', () => {
    const [full, single, none] = purchaseExportRows(
      [row({ happyCallDate: '2026-10-10', durationDays: 30, goalCategory: 'herb', amount: 300000 }), row({ happyCallDate: '2026-10-10' }), row()],
      name
    );
    expect(full.slice(8, 13)).toEqual(['2026-10-10', 30, '2026-10-11', '2026-10-20', '2026-11-04']);
    expect(full[7]).toBe('한약');
    expect(full[5]).toBe(300000);
    expect(single.slice(10, 13)).toEqual(['2026-10-11', '', '']);
    expect(none.slice(8, 13)).toEqual(['', null, '', '', '']);
  });

  it('연락처는 담지 않고 등록자는 이름으로', () => {
    const [r] = purchaseExportRows([row()], name);
    expect(r).not.toContain('010-0000-0001');
    expect(r[14]).toBe('김직원');
  });
});

describe('exportFileName', () => {
  it('구분과 기간이 들어가고 파일 이름에 못 쓰는 글자는 뺀다', () => {
    expect(exportFileName('이벤트', '2026-09-01', '2026-09-30')).toBe('비급여_이벤트_2026-09-01_2026-09-30.xlsx');
    expect(exportFileName(ALL_CATEGORIES, '', '')).toBe('비급여_전체.xlsx');
    expect(exportFileName('27/설:이벤트', '2026-01-01', '')).toBe('비급여_27설이벤트_2026-01-01_오늘까지.xlsx');
  });
});

describe('defaultGoalFor — 상품을 고르면 채울 목표 반영', () => {
  const products = [
    { name: '공진단', goalCategory: null },
    { name: '린다이어트', goalCategory: 'diet' as const },
    { name: '일반한약', goalCategory: 'herb' as const },
    { name: '기타', goalCategory: null },
  ];

  it('상품에 정해 둔 목표가 있으면 그것', () => {
    expect(defaultGoalFor('린다이어트', products)).toBe('diet');
    expect(defaultGoalFor('일반한약', products)).toBe('herb');
  });

  it('정해 둔 게 없으면 상품명으로 짐작(특수한약), 그래도 없으면 없음', () => {
    expect(defaultGoalFor('공진단', products)).toBe('special_herb');
    expect(defaultGoalFor('기타', products)).toBeNull();
    expect(defaultGoalFor('목록에 없는 상품', products)).toBeNull();
  });
});
