export interface ParsedBulkEntry {
  matched: { name: string; amount: number }[];
  unmatchedNames: string[];
  danglingNames: string[];
}

const NUMBER_PATTERN = /^[0-9]+(\.[0-9]+)?$/;

// "당귀 천궁 3 생강 대조 1" 같은 처방 표기 방식을 그대로 받는다 — 숫자 하나가
// 나오면, 그 앞에 나온(아직 숫자가 안 붙은) 약재 이름들 전부에 그 개수를
// 공통으로 적용한다. 예: 당귀·천궁은 3봉지씩, 생강·대조는 1봉지씩.
// 숫자 없이 끝나는 이름들(danglingNames)과, 목록에 없는 이름들(unmatchedNames)은
// 반영하지 않고 따로 돌려줘서 화면에서 주의 표시를 하게 한다.
export function parseBulkHerbEntry(text: string, knownNames: string[]): ParsedBulkEntry {
  const tokens = text.trim().split(/\s+/).filter(Boolean);

  const groups: { names: string[]; amount: number }[] = [];
  let pending: string[] = [];
  for (const token of tokens) {
    if (NUMBER_PATTERN.test(token)) {
      if (pending.length > 0) {
        groups.push({ names: pending, amount: Number(token) });
        pending = [];
      }
      // 앞에 이름이 없는 숫자(예: 맨 앞에 숫자가 나온 경우)는 그냥 버린다.
    } else {
      pending.push(token);
    }
  }

  const knownSet = new Set(knownNames);
  const totals = new Map<string, number>();
  const unmatched = new Set<string>();

  for (const group of groups) {
    for (const name of group.names) {
      if (knownSet.has(name)) {
        totals.set(name, (totals.get(name) ?? 0) + group.amount);
      } else {
        unmatched.add(name);
      }
    }
  }

  return {
    matched: Array.from(totals.entries()).map(([name, amount]) => ({ name, amount })),
    unmatchedNames: Array.from(unmatched),
    danglingNames: pending,
  };
}
