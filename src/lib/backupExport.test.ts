import { describe, it, expect } from 'vitest';
import { EXPORT_DATASETS, getExportDataset, parseMonth } from './backupExport';

describe('parseMonth', () => {
  it('올바른 달은 범위를 돌려준다', () => {
    const r = parseMonth('2026-02');
    expect(r?.from).toBe('2026-02-01');
    expect(r?.to).toBe('2026-03-01');
    expect(r?.dates).toHaveLength(28);
    expect(parseMonth('2028-02')?.dates).toHaveLength(29);
  });

  it('12월은 다음 해 1월 1일까지', () => {
    expect(parseMonth('2026-12')?.to).toBe('2027-01-01');
  });

  it('형식이 틀리거나 없는 달은 null', () => {
    for (const bad of [null, '', '2026-13', '2026-00', '2026-1', '26-01', '2026-01-01', ' 2026-01', '2026-01;drop', '1999-12', '2101-01']) {
      expect(parseMonth(bad)).toBeNull();
    }
  });
});

describe('EXPORT_DATASETS', () => {
  it('정해 둔 자료만 찾고 그 밖의 이름은 거절한다', () => {
    expect(getExportDataset('herb_inventory')?.label).toBe('한약재 재고');
    expect(getExportDataset('staff')).toBeNull();
    expect(getExportDataset('__proto__')).toBeNull();
    expect(getExportDataset('constructor')).toBeNull();
    expect(getExportDataset(null)).toBeNull();
  });

  it('주민등록번호·암호화 열이나 remote_consult 테이블은 없다', () => {
    for (const ds of Object.values(EXPORT_DATASETS)) {
      expect(ds.table ?? '').not.toMatch(/remote_consult|rrn/i);
      for (const c of ds.columns) expect(c.key).not.toMatch(/rrn|encrypt|resident/i);
    }
  });

  it('표를 직접 조회하는 자료에는 정렬 열이 있고 마지막은 id 다', () => {
    for (const ds of Object.values(EXPORT_DATASETS)) {
      if (!ds.table) continue;
      expect(ds.orderBy.length).toBeGreaterThan(0);
      expect(ds.orderBy[ds.orderBy.length - 1]).toBe('id');
    }
  });

  it('상담 요약은 상담일 기준 월별 자료다(원문이 커서 전체 내려받기 금지)', () => {
    const ds = EXPORT_DATASETS.consult_summaries;
    expect(ds.monthly).toBe(true);
    expect(ds.monthColumn).toBe('consult_date');
  });

  it('월 조건이 필요한 직접 조회 자료에는 날짜 열이 있다', () => {
    for (const ds of Object.values(EXPORT_DATASETS)) {
      if (ds.monthly && ds.table) expect(ds.monthColumn).toBeTruthy();
    }
  });
});
