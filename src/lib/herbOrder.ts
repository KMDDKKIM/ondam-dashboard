// 한약재 재고는 "봉지" 단위 하나만 쓴다. 부족한 약재를 골라 발주(주문)할 때 쓰는 계산.

export interface HerbStockLike {
  name: string;
  currentStock: number;
  lowStockThreshold: number | null;
}

/** 부족 기준(봉지)으로 쓸 수 있는 값인가: 0 이상의 정수. */
export function isValidThreshold(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/**
 * 부족 여부: 현재 재고 <= 부족 기준. 기준이 없으면(null) "관리 안 함"이라 부족으로 보지 않는다.
 * 기준 0은 "재고가 다 떨어지면(0봉지) 부족"으로 취급한다 — 새 약재는 기본 기준이 0이라,
 * 따로 기준을 안 정해둔 약재도 0봉지가 되면 자동으로 부족 목록에 뜬다.
 */
export function isShort(currentStock: number, threshold: number | null): boolean {
  if (threshold == null || !Number.isFinite(threshold)) return false;
  return currentStock <= threshold;
}

/**
 * 권장 발주량(봉지) 제안: 기준의 2배까지 채우도록 max(1, 기준*2 - 현재).
 * 부족하지 않은 약재는 0(발주 불필요). 어디까지나 제안이다.
 */
export function recommendOrderQty(currentStock: number, threshold: number | null): number {
  if (!isShort(currentStock, threshold)) return 0;
  const current = Math.max(0, currentStock); // 음수 재고가 들어와도 과대 제안하지 않는다
  return Math.max(1, (threshold as number) * 2 - current);
}

export interface ShortHerb {
  name: string;
  currentStock: number;
  threshold: number;
  recommend: number;
}

/** 부족한 약재만 골라 이름순(가나다)으로 정렬한다. */
export function listShortHerbs(items: HerbStockLike[]): ShortHerb[] {
  return items
    .filter((i) => isShort(i.currentStock, i.lowStockThreshold))
    .map((i) => ({
      name: i.name,
      currentStock: i.currentStock,
      threshold: i.lowStockThreshold as number,
      recommend: recommendOrderQty(i.currentStock, i.lowStockThreshold),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** "당귀 — 현재 2봉지 (기준 5) — 권장 발주 8봉지" 형식의 줄들. */
export function formatOrderLines(shorts: ShortHerb[]): string {
  return shorts
    .map((s) => `${s.name} — 현재 ${s.currentStock}봉지 (기준 ${s.threshold}) — 권장 발주 ${s.recommend}봉지`)
    .join('\n');
}
