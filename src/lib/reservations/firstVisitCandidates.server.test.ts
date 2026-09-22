import { beforeEach, describe, expect, it, vi } from 'vitest';

// next 번들 밖에서는 'server-only' 패키지를 못 찾는다(next.js가 내부적으로만 번들함) — 테스트에서 빈 모듈로 대신한다.
vi.mock('server-only', () => ({}));
// 접수기록부 읽기(loadChartBaselineSnapshot 캐시 테스트에는 안 쓰지만, 모듈 로드 때 생성자가 불린다)용 서버 클라이언트도 가짜로.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

// patient_visit_history/daily_visits 를 훑는 range()·limit() 호출 횟수 — "DB를 실제로 다시 훑었는가"의 스파이.
let fetchCallCount = 0;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {};
      chain.select = () => chain;
      chain.lt = () => chain;
      chain.order = () => chain;
      chain.eq = () => chain;
      chain.in = () => chain;
      chain.not = () => chain;
      chain.range = () => {
        fetchCallCount++;
        return Promise.resolve({ data: [{ chart_no: '000123' }], error: null });
      };
      chain.limit = () => {
        fetchCallCount++;
        return Promise.resolve({ data: [], error: null });
      };
      return chain;
    },
  }),
}));

describe('loadChartBaselineSnapshot 캐시(날짜별, TTL 5분)', () => {
  beforeEach(async () => {
    fetchCallCount = 0;
    const mod = await import('./firstVisitCandidates.server');
    mod.clearChartBaselineCacheForTests();
  });

  it('같은 날짜로 TTL 안에 다시 부르면 DB를 다시 훑지 않고 캐시된 값을 그대로 쓴다', async () => {
    const { loadChartBaselineSnapshot } = await import('./firstVisitCandidates.server');
    const now = 1_700_000_000_000;
    const a = await loadChartBaselineSnapshot('2026-09-22', '2026-01-01', '2026-09-01', now);
    const callsAfterFirst = fetchCallCount;
    expect(callsAfterFirst).toBeGreaterThan(0); // 첫 호출은 실제로 훑었다

    const b = await loadChartBaselineSnapshot('2026-09-22', '2026-01-01', '2026-09-01', now + 60_000); // 1분 뒤, TTL(5분) 안
    expect(fetchCallCount).toBe(callsAfterFirst); // 더 안 늘어남 = DB를 다시 안 불렀다
    expect(b).toEqual(a);
  });

  it('TTL(5분)이 지나면 같은 날짜라도 다시 DB를 훑는다', async () => {
    const { loadChartBaselineSnapshot } = await import('./firstVisitCandidates.server');
    const now = 1_700_000_000_000;
    await loadChartBaselineSnapshot('2026-09-22', '2026-01-01', '2026-09-01', now);
    const callsAfterFirst = fetchCallCount;

    await loadChartBaselineSnapshot('2026-09-22', '2026-01-01', '2026-09-01', now + 5 * 60 * 1000 + 1); // TTL 초과
    expect(fetchCallCount).toBeGreaterThan(callsAfterFirst);
  });

  it('날짜가 다르면(다른 키) TTL 안에서도 각각 새로 계산한다', async () => {
    const { loadChartBaselineSnapshot } = await import('./firstVisitCandidates.server');
    const now = 1_700_000_000_000;
    await loadChartBaselineSnapshot('2026-09-22', '2026-01-01', '2026-09-01', now);
    const callsAfterFirst = fetchCallCount;

    await loadChartBaselineSnapshot('2026-09-23', '2026-01-01', '2026-09-01', now);
    expect(fetchCallCount).toBeGreaterThan(callsAfterFirst);
  });
});
