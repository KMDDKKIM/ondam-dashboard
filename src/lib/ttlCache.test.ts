import { describe, expect, it, vi } from 'vitest';
import { createTtlCache, getOrCompute } from './ttlCache';

describe('createTtlCache / getOrCompute', () => {
  it('같은 키로 TTL 안에 다시 부르면 캐시된 값을 쓰고 compute를 다시 부르지 않는다', async () => {
    const cache = createTtlCache<number>(5 * 60 * 1000);
    const compute = vi.fn().mockResolvedValue(42);
    const now = 1_000_000;
    const a = await getOrCompute(cache, '2026-09-22', compute, now);
    const b = await getOrCompute(cache, '2026-09-22', compute, now + 60_000); // 1분 뒤, TTL(5분) 안
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('TTL이 지나면(같은 키라도) 다시 계산한다', async () => {
    const cache = createTtlCache<number>(5 * 60 * 1000);
    const compute = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const now = 1_000_000;
    const a = await getOrCompute(cache, 'k', compute, now);
    const b = await getOrCompute(cache, 'k', compute, now + 5 * 60 * 1000 + 1); // TTL 초과
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('키(날짜 등)가 다르면 각각 따로 계산한다', async () => {
    const cache = createTtlCache<number>(5 * 60 * 1000);
    const compute = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const now = 1_000_000;
    const a = await getOrCompute(cache, '2026-09-22', compute, now);
    const b = await getOrCompute(cache, '2026-09-23', compute, now);
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('clear() 뒤에는 같은 키라도 다시 계산한다', async () => {
    const cache = createTtlCache<number>(5 * 60 * 1000);
    const compute = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const now = 1_000_000;
    await getOrCompute(cache, 'k', compute, now);
    cache.clear();
    const b = await getOrCompute(cache, 'k', compute, now);
    expect(b).toBe(2);
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
