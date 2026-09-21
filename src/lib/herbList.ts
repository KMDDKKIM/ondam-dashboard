// 한약재 재고 목록 화면의 순수 계산: 가나다 정렬, 검색·필터, 묶음, 중복 이름 검사.
// 재고는 봉지 수(0 이상의 정수)만 쓴다.
import { isShort } from '@/lib/herbOrder';
import { initialGroupKey, matchesHerbName, normalizeForSearch } from '@/lib/koreanSearch';

export interface HerbLike {
  id?: string;
  name: string;
  currentStock: number;
  lowStockThreshold?: number | null;
}

export type HerbFilter = 'all' | 'short' | 'empty';

const collator = new Intl.Collator('ko');

/** 옛 숫자 컬럼(소수·음수 가능)을 화면용 봉지 수(0 이상의 정수)로. */
export function bagCount(stock: number): number {
  if (!Number.isFinite(stock)) return 0;
  return Math.max(0, Math.floor(stock));
}

/** 가나다순(한국어 정렬)으로 새 배열을 돌려준다. 이름이 같으면 들어온 순서를 지킨다. */
export function sortHerbsKo<T extends { name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => collator.compare(a.name, b.name));
}

export function isEmptyHerb(item: HerbLike): boolean {
  return bagCount(item.currentStock) === 0;
}

export function isShortHerb(item: HerbLike): boolean {
  return isShort(bagCount(item.currentStock), item.lowStockThreshold ?? null);
}

export interface HerbCounts {
  all: number;
  short: number;
  empty: number;
}

/** 필터 칩에 표시할 개수. "부족"은 부족 기준 이하(0봉지 포함)라 "0봉지"와 겹칠 수 있다. */
export function countHerbs(items: readonly HerbLike[]): HerbCounts {
  let short = 0;
  let empty = 0;
  for (const i of items) {
    if (isShortHerb(i)) short++;
    if (isEmptyHerb(i)) empty++;
  }
  return { all: items.length, short, empty };
}

/** 이미 정렬된 목록에서 필터·검색어에 맞는 것만 골라낸다(순서 유지). */
export function filterHerbs<T extends HerbLike>(sorted: readonly T[], query: string, filter: HerbFilter): T[] {
  return sorted.filter((i) => {
    if (filter === 'short' && !isShortHerb(i)) return false;
    if (filter === 'empty' && !isEmptyHerb(i)) return false;
    return matchesHerbName(i.name, query);
  });
}

export interface HerbGroup<T> {
  key: string;
  items: T[];
}

/** 이미 정렬된 목록을 첫 글자 초성으로 묶는다. 묶음 순서는 목록에 나온 순서. */
export function groupHerbsByInitial<T extends { name: string }>(sorted: readonly T[]): HerbGroup<T>[] {
  const groups: HerbGroup<T>[] = [];
  for (const item of sorted) {
    const key = initialGroupKey(item.name);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}

/** 공백·대소문자를 무시한 이름 비교용 키. */
export function herbNameKey(name: string): string {
  return normalizeForSearch(name);
}

export function findDuplicateHerb<T extends { name: string }>(items: readonly T[], name: string): T | undefined {
  const key = herbNameKey(name);
  if (key === '') return undefined;
  return items.find((i) => herbNameKey(i.name) === key);
}

export interface NewHerbPartition<E extends { name: string }, T extends { name: string }> {
  toAdd: E[];
  /** 이미 등록된 약재와 이름이 같아(공백·대소문자 무시) 건너뛴 입력들. */
  existing: { entry: E; herb: T }[];
  /** 입력 안에서 이름이 겹쳐 처음 것만 쓴 이름들. */
  repeated: string[];
}

/** 새로 넣을 약재들을 "추가할 것 / 이미 있는 것 / 입력 안 중복"으로 나눈다. */
export function partitionNewHerbs<E extends { name: string }, T extends { name: string }>(
  existingItems: readonly T[],
  entries: readonly E[]
): NewHerbPartition<E, T> {
  const toAdd: E[] = [];
  const existing: { entry: E; herb: T }[] = [];
  const repeated: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const herb = findDuplicateHerb(existingItems, entry.name);
    if (herb) {
      existing.push({ entry, herb });
      continue;
    }
    const key = herbNameKey(entry.name);
    if (seen.has(key)) {
      repeated.push(entry.name);
      continue;
    }
    seen.add(key);
    toAdd.push(entry);
  }
  return { toAdd, existing, repeated };
}
