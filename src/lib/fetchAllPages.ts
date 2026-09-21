// 여러 쪽에 걸친 조회를 빠짐없이 이어 받는 도우미. Supabase(PostgREST) 한 번 조회 상한이 1000행이라고
// 가정하지 않는다 — 서버 설정이 더 작아도 첫 쪽의 전체 개수(count)를 기준으로 다 받을 때까지 이어 읽는다.
// run 은 `.select(..., { count: 'exact' })` 로 조회해 count 를 돌려줘야 한다.

export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
  count?: number | null;
}

export const DEFAULT_PAGE_SIZE = 1000;
export const MAX_PAGES = 500;

export async function fetchAllPages<T>(
  run: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = DEFAULT_PAGE_SIZE,
  maxPages: number = MAX_PAGES
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;
  for (let pageNo = 0; pageNo < maxPages; pageNo++) {
    const { data, error, count } = await run(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    if (pageNo === 0 && typeof count === 'number') total = count;
    rows.push(...page);
    if (page.length === 0) return rows;
    if (total !== null && rows.length >= total) return rows;
  }
  // 안전장치: 끝없이 이어 읽지 않는다. 조용히 잘린 자료를 내보내느니 실패로 알린다.
  throw new Error(`fetchAllPages: ${maxPages}쪽을 넘게 읽었습니다.`);
}
