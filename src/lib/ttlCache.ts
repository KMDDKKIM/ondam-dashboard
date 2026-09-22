// 짧은 TTL의 인메모리 캐시(순수 유틸). DB·Redis 없이, 서버리스 함수가 가까운 요청 사이에
// warm 상태로 남아 있는 걸 이용해 "자주 안 바뀌는데 계산은 무거운" 값을 잠깐 재사용한다.
// 콜드스타트·재배포되면 그냥 다시 계산되니 정합성 문제는 없다 — TTL이 지나거나 키가 다르면 항상 새로 계산한다.

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface TtlCache<V> {
  get(key: string, now?: number): V | undefined;
  set(key: string, value: V, now?: number): void;
  clear(): void;
}

export function createTtlCache<V>(ttlMs: number): TtlCache<V> {
  const store = new Map<string, CacheEntry<V>>();
  return {
    get(key: string, now: number = Date.now()): V | undefined {
      const entry = store.get(key);
      if (!entry || entry.expiresAt <= now) return undefined;
      return entry.value;
    },
    set(key: string, value: V, now: number = Date.now()): void {
      store.set(key, { value, expiresAt: now + ttlMs });
    },
    clear(): void {
      store.clear();
    },
  };
}

/** 캐시에 있으면 그대로 돌려주고, 없거나(또는 TTL이 지났으면) compute()를 불러 결과를 저장한 뒤 돌려준다. */
export async function getOrCompute<V>(
  cache: TtlCache<V>,
  key: string,
  compute: () => Promise<V>,
  now: number = Date.now()
): Promise<V> {
  const cached = cache.get(key, now);
  if (cached !== undefined) return cached;
  const value = await compute();
  cache.set(key, value, now);
  return value;
}
