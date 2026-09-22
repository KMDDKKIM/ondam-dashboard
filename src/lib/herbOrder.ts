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

export interface ShortHerb {
  name: string;
  currentStock: number;
}

// 권장 발주량 제안 기능은 없앴다(원장 결정, 2026-09-23: 주문 수량은 직접 정한다) —
// 여기서는 부족한 약재가 "무엇인지"만 골라준다.

/** 부족한 약재만 골라 이름순(가나다)으로 정렬한다. */
export function listShortHerbs(items: HerbStockLike[]): ShortHerb[] {
  return items
    .filter((i) => isShort(i.currentStock, i.lowStockThreshold))
    .map((i) => ({ name: i.name, currentStock: i.currentStock }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/** "당귀 — 현재 2봉지" 형식의 줄들. */
export function formatOrderLines(shorts: ShortHerb[]): string {
  return shorts.map((s) => `${s.name} — 현재 ${s.currentStock}봉지`).join('\n');
}
