import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './withTimeout';

describe('withTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('제때 끝나면 값을 돌려준다', async () => {
    await expect(withTimeout(Promise.resolve(5), 1000)).resolves.toBe(5);
  });

  it('시간이 지나도 안 끝나면 null', async () => {
    const p = withTimeout(new Promise<number>(() => {}), 8000);
    vi.advanceTimersByTime(8000);
    await expect(p).resolves.toBeNull();
  });

  it('조회가 실패해도 null', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 1000)).resolves.toBeNull();
  });

  it('늦게 끝난 값은 무시한다', async () => {
    let done!: (v: number) => void;
    const p = withTimeout(new Promise<number>((r) => (done = r)), 100);
    vi.advanceTimersByTime(100);
    done(7);
    await expect(p).resolves.toBeNull();
  });
});
