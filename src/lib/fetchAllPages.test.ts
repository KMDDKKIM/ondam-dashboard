import { describe, it, expect } from 'vitest';
import { fetchAllPages, type PageResult } from './fetchAllPages';

// 서버가 한 번에 maxRows 행까지만 주는 가짜 클라이언트(요청한 범위가 더 커도 잘라서 준다).
function fakeClient(total: number, maxRows: number, withCount = true) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const run = async (from: number, to: number): Promise<PageResult<{ id: number }>> => {
    calls.push([from, to]);
    const end = Math.min(to, from + maxRows - 1);
    return { data: all.slice(from, end + 1), error: null, count: withCount ? total : null };
  };
  return { run, calls };
}

describe('fetchAllPages', () => {
  it('서버 상한(3행)이 요청한 쪽 크기(1000)보다 작아도 전부 받는다', async () => {
    const { run } = fakeClient(8, 3);
    const rows = await fetchAllPages(run);
    expect(rows.map((r) => r.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('개수가 딱 맞으면 불필요한 조회를 더 하지 않는다', async () => {
    const { run, calls } = fakeClient(6, 3);
    await fetchAllPages(run);
    expect(calls).toHaveLength(2);
  });

  it('count 를 못 받으면 빈 쪽이 나올 때까지 이어 읽는다', async () => {
    const { run } = fakeClient(7, 3, false);
    expect(await fetchAllPages(run)).toHaveLength(7);
  });

  it('행이 없으면 빈 배열', async () => {
    const { run } = fakeClient(0, 3);
    expect(await fetchAllPages(run)).toEqual([]);
  });

  it('오류는 그대로 던진다', async () => {
    await expect(fetchAllPages(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom');
  });

  it('쪽 수 상한을 넘으면 던진다', async () => {
    const endless = async (from: number): Promise<PageResult<number>> => ({ data: [from], error: null, count: null });
    await expect(fetchAllPages(endless, 1, 5)).rejects.toThrow();
  });
});
