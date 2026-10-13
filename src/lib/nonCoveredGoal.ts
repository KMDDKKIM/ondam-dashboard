import type { GoalCategory } from './types';

// 특수한약으로 분류되는 품목 — 상품 목록에 정해 둔 목표가 없을 때, 상품명으로 "목표 반영"을 특수한약으로 짐작한다.
export const SPECIAL_HERB_PRODUCTS = ['공진단', '경옥고', '녹용관절고', '보폐고엔오'];

export function suggestGoalCategory(productName: string): GoalCategory | null {
  return SPECIAL_HERB_PRODUCTS.some((name) => productName.includes(name)) ? 'special_herb' : null;
}
