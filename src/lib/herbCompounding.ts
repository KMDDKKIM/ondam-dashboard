// 한약 처방전(조제 지시서)의 순수 로직 — 약재별 1첩당 그램수 × 첩수 = 총용량을 계산한다.
// 이 총용량을 보고 직원이 실제로 약재를 계량해 조제한다. 화면/DB 코드는 따로 있다.

export interface HerbLine {
  herbName: string;
  /** 1첩당 그램수(소수 가능 — 예: 7.5g). */
  gramsPerPacket: number;
}

export interface HerbCompoundingOrder {
  id: string;
  patientName: string;
  /** 없을 수도 있다(신환 등록 전 등) — 예약자 명단과 같은 관례로 빈 문자열을 쓴다. */
  chartNo: string;
  orderDate: string; // YYYY-MM-DD
  /** 첩수 — 처방 전체에 적용되는 한 값이다(약재마다 따로 첩수를 두지 않는다). */
  packetCount: number;
  herbs: HerbLine[];
  memo: string;
  createdAt: string;
  updatedAt: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 한 약재의 총용량(g) = 1첩당 그램 × 첩수. */
export function herbLineTotal(line: Pick<HerbLine, 'gramsPerPacket'>, packetCount: number): number {
  return round1(line.gramsPerPacket * packetCount);
}

/** 처방 전체 약재 총량(g) — 모든 줄의 총용량 합. */
export function totalHerbWeight(herbs: HerbLine[], packetCount: number): number {
  return round1(herbs.reduce((sum, h) => sum + h.gramsPerPacket * packetCount, 0));
}

/** 저장·인쇄해도 되는 최소 조건 — 환자명·첩수·약재(이름+그램)가 하나 이상 채워져 있어야 한다. */
export function canSaveOrder(order: Pick<HerbCompoundingOrder, 'patientName' | 'packetCount' | 'herbs'>): boolean {
  if (order.patientName.trim() === '') return false;
  if (!(order.packetCount > 0)) return false;
  return order.herbs.some((h) => h.herbName.trim() !== '' && h.gramsPerPacket > 0);
}

/** 약재 줄 중 이름은 있는데 그램이 비었거나(0 이하) 반대로 그램만 있고 이름이 없는 줄 —
 * 저장 전에 확인을 요청하기 위한 목록(줄 번호, 1부터). */
export function incompleteHerbLines(herbs: HerbLine[]): number[] {
  return herbs
    .map((h, i) => ({ i, hasName: h.herbName.trim() !== '', hasGrams: h.gramsPerPacket > 0 }))
    .filter((h) => h.hasName !== h.hasGrams)
    .map((h) => h.i + 1);
}
