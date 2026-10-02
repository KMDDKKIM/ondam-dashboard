// 부원장 인센티브 계산의 순수 로직. 구분(항목)마다 계산 방식이 둘 중 하나다:
// - percent_of_amount: 결제금액 × 비율 (예: 한약 티케팅 10%)
// - fixed_per_entry: 건당 고정 금액, 결제금액과 무관 (예: 단순추나 1건당 5,000원)
// 화면/DB 코드는 따로 있다 — 이 파일은 계산만 한다.

export type IncentiveCalcType = 'percent_of_amount' | 'fixed_per_entry';

export interface IncentiveCategory {
  id: string;
  name: string;
  color: string;
  calcType: IncentiveCalcType;
  /** calcType='percent_of_amount'일 때만 쓴다. 0.1 = 10%. */
  percent: number | null;
  /** calcType='fixed_per_entry'일 때만 쓴다(원). */
  fixedAmount: number | null;
  active: boolean;
}

export interface IncentiveEntry {
  id: string;
  categoryId: string;
  entryDate: string; // YYYY-MM-DD
  patientName: string;
  amount: number;
  note: string;
}

/** 한 건의 인센티브 금액. 카테고리를 못 찾으면(삭제된 경우 등) 0. */
export function computeEntryIncentive(
  entry: Pick<IncentiveEntry, 'categoryId' | 'amount'>,
  categories: Pick<IncentiveCategory, 'id' | 'calcType' | 'percent' | 'fixedAmount'>[]
): number {
  const category = categories.find((c) => c.id === entry.categoryId);
  if (!category) return 0;
  if (category.calcType === 'fixed_per_entry') return category.fixedAmount ?? 0;
  return Math.round(entry.amount * (category.percent ?? 0));
}

/** 여러 건의 인센티브 합계. */
export function sumIncentive(
  entries: Pick<IncentiveEntry, 'categoryId' | 'amount'>[],
  categories: Pick<IncentiveCategory, 'id' | 'calcType' | 'percent' | 'fixedAmount'>[]
): number {
  return entries.reduce((sum, e) => sum + computeEntryIncentive(e, categories), 0);
}

/** YYYY-MM-DD 날짜가 YYYY-MM 달에 속하는지. */
export function isInMonth(date: string, month: string): boolean {
  return date.startsWith(month);
}

/** 구분 입력칸에서 금액 칸이 의미 있는지 — fixed_per_entry면 결제금액과 무관하므로 숨겨도 된다. */
export function categoryNeedsAmount(category: Pick<IncentiveCategory, 'calcType'> | null | undefined): boolean {
  return (category?.calcType ?? 'percent_of_amount') === 'percent_of_amount';
}
