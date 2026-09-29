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

const NUMBER_PATTERN = /^[0-9]+(\.[0-9]+)?$/;

export interface ParsedHerbEntry {
  herbs: HerbLine[];
  /** 끝까지 그램이 안 붙어 반영되지 않은 이름들. */
  danglingNames: string[];
}

// "당귀 천궁 백출 4 산사 신곡 맥아 2" 처럼, 숫자 하나가 나오면 그 앞에 나온(아직 숫자가
// 안 붙은) 약재 이름들 전부에 그 숫자를 1첩당 그램으로 적용한다(한약재 재고 일괄
// 입고/사용 입력과 같은 표기). 줄바꿈·쉼표도 공백처럼 다뤄 붙여넣기도 그대로 받는다.
// 같은 이름이 여러 번 나오면 그램을 더한다. 맨 앞에 숫자만 있고 이름이 없으면 버린다.
export function parseHerbGramsEntry(text: string): ParsedHerbEntry {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const herbs: HerbLine[] = [];
  const indexByName = new Map<string, number>();
  let pending: string[] = [];

  function flush(grams: number) {
    for (const name of pending) {
      const existingIndex = indexByName.get(name);
      if (existingIndex != null) {
        herbs[existingIndex] = { herbName: name, gramsPerPacket: round1(herbs[existingIndex].gramsPerPacket + grams) };
      } else {
        indexByName.set(name, herbs.length);
        herbs.push({ herbName: name, gramsPerPacket: grams });
      }
    }
    pending = [];
  }

  for (const token of tokens) {
    if (NUMBER_PATTERN.test(token)) {
      if (pending.length > 0) flush(Number(token));
    } else {
      pending.push(token);
    }
  }

  return { herbs, danglingNames: pending };
}

// 일괄 입력으로 새로 읽은 약재를, 이미 입력칸에 있던 약재 줄 뒤에 더한다. 완전히 빈 줄(이름도
// 그램도 없는, 새 처방전 시작 시의 기본 빈 줄)은 버리고, 이름이 같으면(공백 다듬은 뒤) 그램을
// 더한다 — 이미 손으로 채워 둔 줄을 일괄 입력이 지우지 않는다.
export function mergeHerbLines(existing: HerbLine[], parsed: HerbLine[]): HerbLine[] {
  const merged: HerbLine[] = existing.filter((h) => h.herbName.trim() !== '' || h.gramsPerPacket > 0).map((h) => ({ ...h }));
  const indexByName = new Map(merged.map((h, i) => [h.herbName.trim(), i]));
  for (const h of parsed) {
    const key = h.herbName.trim();
    const existingIndex = indexByName.get(key);
    if (existingIndex != null) {
      merged[existingIndex] = { ...merged[existingIndex], gramsPerPacket: round1(merged[existingIndex].gramsPerPacket + h.gramsPerPacket) };
    } else {
      indexByName.set(key, merged.length);
      merged.push({ ...h });
    }
  }
  return merged;
}
