import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { countOpenSupplyRequests } from './supplyCounts';

type Result = { count: number | null; error: unknown };

// select().is().not()... 체인의 끝이 결과로 풀리는 최소한의 가짜 클라이언트.
function fakeClient(results: Result[]): SupabaseClient {
  let call = 0;
  return {
    from: () => {
      const result = results[call++];
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.is = () => chain;
      chain.not = () => chain;
      chain.then = (resolve: (r: Result) => unknown) => resolve(result);
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe('countOpenSupplyRequests', () => {
  it('주문 대기/도착 대기 건수를 돌려준다', async () => {
    const r = await countOpenSupplyRequests(fakeClient([{ count: 3, error: null }, { count: 2, error: null }]));
    expect(r).toEqual({ waitingOrder: 3, waitingArrival: 2 });
  });
  it('한쪽이라도 실패하면 0건 + error', async () => {
    const r = await countOpenSupplyRequests(fakeClient([{ count: 3, error: null }, { count: null, error: { message: 'x' } }]));
    expect(r).toEqual({ waitingOrder: 0, waitingArrival: 0, error: true });
  });
  it('예외가 나도 0건 + error', async () => {
    const boom = { from: () => { throw new Error('boom'); } } as unknown as SupabaseClient;
    expect(await countOpenSupplyRequests(boom)).toEqual({ waitingOrder: 0, waitingArrival: 0, error: true });
  });
});
