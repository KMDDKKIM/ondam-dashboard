import { describe, it, expect } from 'vitest';
import { formatKstDateTime, groupLogsIntoBatches, signedChange, staffLabel } from './herbHistory';
import type { HerbInventoryLog } from './types';

describe('herbHistory', () => {
  it('UTC 시각을 한국 시각으로 표시한다', () => {
    expect(formatKstDateTime('2026-09-19T15:30:00Z')).toBe('2026-09-20 00:30');
  });
  it('입고는 +, 사용은 -', () => {
    expect(signedChange('restock', 5)).toBe('+5');
    expect(signedChange('use', 2)).toBe('-2');
  });
  it('삭제된 직원은 (삭제된 직원)', () => {
    expect(staffLabel(null, { a: '김' })).toBe('(삭제된 직원)');
    expect(staffLabel('zzz', { a: '김' })).toBe('(삭제된 직원)');
    expect(staffLabel('a', { a: '김' })).toBe('김');
  });
});

describe('groupLogsIntoBatches', () => {
  function log(o: Partial<HerbInventoryLog>): HerbInventoryLog {
    return {
      id: 'l1',
      herbId: 'h1',
      changeType: 'restock',
      amount: 1,
      note: null,
      createdBy: 'staff1',
      createdAt: '2026-09-23T05:00:00Z',
      ...o,
    };
  }

  it('같은 시각·같은 처리자의 로그를 한 묶음으로 만든다(한꺼번에 입력)', () => {
    const logs = [
      log({ id: 'a', herbId: 'h1' }),
      log({ id: 'b', herbId: 'h2' }),
      log({ id: 'c', herbId: 'h3' }),
    ];
    const batches = groupLogsIntoBatches(logs);
    expect(batches).toHaveLength(1);
    expect(batches[0].changes.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(batches[0].createdBy).toBe('staff1');
  });

  it('시각이나 처리자가 다르면 다른 묶음', () => {
    const logs = [
      log({ id: 'a', createdAt: '2026-09-23T05:00:00Z', createdBy: 'staff1' }),
      log({ id: 'b', createdAt: '2026-09-23T05:00:00Z', createdBy: 'staff2' }),
      log({ id: 'c', createdAt: '2026-09-23T04:00:00Z', createdBy: 'staff1' }),
    ];
    const batches = groupLogsIntoBatches(logs);
    expect(batches).toHaveLength(3);
  });

  it('빈 목록', () => {
    expect(groupLogsIntoBatches([])).toEqual([]);
  });
});
