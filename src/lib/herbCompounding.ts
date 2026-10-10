// 한약 처방전(조제 지시서)의 순수 로직 — 약재별 1첩당 그램수 × 첩수 = 총용량을 계산한다.
// 이 총용량을 보고 직원이 실제로 약재를 계량해 조제한다. 화면/DB 코드는 따로 있다.

export interface HerbLine {
  herbName: string;
  /** 수치(포제) — 초·주초·자 같은 가공 방법. 없으면 빈 문자열(생약 그대로). */
  prepMethod: string;
  /** 1첩당 그램수(소수 가능 — 예: 7.5g). */
  gramsPerPacket: number;
  /** 한자 이름(처방집에서 가져온 약재에만 있다) — 처방전 입력·인쇄에는 쓰지 않는다. */
  hanja?: string;
}

export interface HerbCompoundingOrder {
  id: string;
  patientName: string;
  /** 없을 수도 있다(신환 등록 전 등) — 예약자 명단과 같은 관례로 빈 문자열을 쓴다. */
  chartNo: string;
  /** 처방명(예: 보중익기탕) — 선택. 과거 기록에서 환자별로 어떤 처방을 받았는지 찾아보는 용도. */
  prescriptionName: string;
  orderDate: string; // YYYY-MM-DD
  /** 첩수 — 처방 전체에 적용되는 한 값이다(약재마다 따로 첩수를 두지 않는다). */
  packetCount: number;
  /** 탕전(달임) 정보 — 전부 선택, 0은 "안 적음"이다.
   * 며칠분은 첩수와 같이 움직이는 게 기본(하루 한 첩 관례)이지만 직접 고칠 수 있다 —
   * 화면(OrderForm)에서 "며칠분이 첩수와 같았을 때만" 첩수를 따라가게 해서 구현한다.
   * 팩수 = 하루 복용횟수 × 며칠분으로 자동 계산한다(화면에서 계산해 넣어 둔다, 원장 요청 2026-09-30). */
  packVolumeMl: number;
  daysSupply: number;
  /** 하루 몇 번 복용하는지 — 팩수 자동 계산에 쓰인다. */
  dosesPerDay: number;
  packCount: number;
  totalLiquidMl: number;
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
export function totalHerbWeight(herbs: Pick<HerbLine, 'gramsPerPacket'>[], packetCount: number): number {
  return round1(herbs.reduce((sum, h) => sum + h.gramsPerPacket * packetCount, 0));
}

/** 저장·인쇄해도 되는 최소 조건 — 환자명·첩수·약재(이름+그램)가 하나 이상 채워져 있어야 한다. */
export function canSaveOrder(order: {
  patientName: string;
  packetCount: number;
  herbs: Pick<HerbLine, 'herbName' | 'gramsPerPacket'>[];
}): boolean {
  if (order.patientName.trim() === '') return false;
  if (!(order.packetCount > 0)) return false;
  return order.herbs.some((h) => h.herbName.trim() !== '' && h.gramsPerPacket > 0);
}

/** 약재 줄 중 이름은 있는데 그램이 비었거나(0 이하) 반대로 그램만 있고 이름이 없는 줄 —
 * 저장 전에 확인을 요청하기 위한 목록(줄 번호, 1부터). */
export function incompleteHerbLines(herbs: Pick<HerbLine, 'herbName' | 'gramsPerPacket'>[]): number[] {
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
// 같은 이름이 여러 번 나와도 그램을 더하지 않고 줄을 따로 둔다(겹치는 약재는 화면에서 빨갛게 경고한다 —
// duplicateHerbNames). 맨 앞에 숫자만 있고 이름이 없으면 버린다.
export function parseHerbGramsEntry(text: string): ParsedHerbEntry {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const herbs: HerbLine[] = [];
  let pending: string[] = [];

  function flush(grams: number) {
    for (const name of pending) {
      // 일괄 입력 표기에는 수치(포제)가 없다 — 필요하면 약재 목록에서 따로 채운다.
      herbs.push({ herbName: name, prepMethod: '', gramsPerPacket: grams });
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

/** 팩수 = 하루 복용횟수 × 며칠분. 둘 중 하나라도 안 적었으면(0 이하) 0(안 적음). */
export function computePackCount(dosesPerDay: number, daysSupply: number): number {
  return dosesPerDay > 0 && daysSupply > 0 ? dosesPerDay * daysSupply : 0;
}

/** 1첩당 그램 기준으로 약재 줄을 정렬한다(안정 정렬 — 그램이 같으면 원래 순서 유지). */
export function sortHerbLinesByGrams<T extends Pick<HerbLine, 'gramsPerPacket'>>(
  herbs: T[],
  direction: 'asc' | 'desc'
): T[] {
  return [...herbs].sort((a, b) => (direction === 'asc' ? a.gramsPerPacket - b.gramsPerPacket : b.gramsPerPacket - a.gramsPerPacket));
}

// 일괄 입력으로 새로 읽은 약재를, 이미 입력칸에 있던 약재 줄 뒤에 더한다. 완전히 빈 줄(이름도
// 그램도 없는, 새 처방전 시작 시의 기본 빈 줄)은 버린다. 이름이 같은 약재가 있어도 그램을 합치지
// 않고 줄을 따로 둔다 — 겹친 것은 duplicateHerbNames 로 찾아 화면에서 경고한다(원장 요청, 2026-10-06).
export function mergeHerbLines(existing: HerbLine[], parsed: HerbLine[]): HerbLine[] {
  const kept = existing.filter((h) => h.herbName.trim() !== '' || h.gramsPerPacket > 0).map((h) => ({ ...h }));
  return [...kept, ...parsed.map((h) => ({ ...h }))];
}

/** 이름이 겹치는 약재(공백을 다듬은 뒤 같은 이름이 두 줄 이상). 빈 이름은 세지 않는다. */
export function duplicateHerbNames(herbs: Pick<HerbLine, 'herbName'>[]): string[] {
  const count = new Map<string, number>();
  for (const h of herbs) {
    const name = h.herbName.trim();
    if (name !== '') count.set(name, (count.get(name) ?? 0) + 1);
  }
  return [...count].filter(([, n]) => n > 1).map(([name]) => name);
}
