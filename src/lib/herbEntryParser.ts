export interface ParsedBulkEntry {
  matched: { name: string; amount: number }[];
  unmatchedNames: string[];
  danglingNames: string[];
  // 개수가 0이거나 소수(봉지는 1 이상의 정수만 가능)라 반영하지 않는 이름들.
  invalidAmountNames: string[];
}

const NUMBER_PATTERN = /^[0-9]+(\.[0-9]+)?$/;

// "당귀 천궁 3 생강 대조 1" 같은 처방 표기 방식을 그대로 받는다 — 숫자 하나가
// 나오면, 그 앞에 나온(아직 숫자가 안 붙은) 약재 이름들 전부에 그 개수를
// 공통으로 적용한다. 예: 당귀·천궁은 3씩, 생강·대조는 1씩.
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
  const invalid = new Set<string>();

  for (const group of groups) {
    const validAmount = Number.isInteger(group.amount) && group.amount >= 1;
    for (const name of group.names) {
      if (!knownSet.has(name)) {
        unmatched.add(name);
      } else if (!validAmount) {
        invalid.add(name);
      } else {
        totals.set(name, (totals.get(name) ?? 0) + group.amount);
      }
    }
  }

  return {
    matched: Array.from(totals.entries()).map(([name, amount]) => ({ name, amount })),
    unmatchedNames: Array.from(unmatched),
    danglingNames: pending,
    invalidAmountNames: Array.from(invalid),
  };
}

export interface ParsedNewHerbs {
  entries: { name: string; stock: number; missingStock: boolean }[];
  duplicateNames: string[];
  // 재고가 소수라(봉지는 정수만) 등록하지 않는 이름들.
  invalidStockNames: string[];
}

// 새 약재를 여러 개 한 번에 등록할 때 쓰는 입력. 일괄 입고와 같은 표기를 따른다 —
// "당귀 5 / 천궁 3 / 생강 대조 1"처럼 숫자가 나오면 그 앞에 나온(아직 숫자가 안 붙은)
// 이름들 모두의 재고가 된다. 줄바꿈·쉼표도 공백처럼 취급해서 엑셀에서 복사한
// 목록도 그대로 붙여 넣을 수 있다. 끝까지 숫자가 안 붙은 이름은 재고 0으로 등록하고
// missingStock으로 표시해 화면에서 알려준다. 같은 이름이 또 나오면 처음 것만 쓴다.
export function parseNewHerbs(text: string): ParsedNewHerbs {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const entries: ParsedNewHerbs['entries'] = [];
  const seen = new Set<string>();
  const duplicateNames: string[] = [];
  const invalidStockNames: string[] = [];
  let pending: string[] = [];

  function flush(stock: number, missingStock: boolean) {
    for (const name of pending) {
      if (!Number.isInteger(stock)) {
        if (!invalidStockNames.includes(name)) invalidStockNames.push(name);
        continue;
      }
      if (seen.has(name)) {
        if (!duplicateNames.includes(name)) duplicateNames.push(name);
        continue;
      }
      seen.add(name);
      entries.push({ name, stock, missingStock });
    }
    pending = [];
  }

  for (const token of tokens) {
    if (NUMBER_PATTERN.test(token)) {
      if (pending.length > 0) flush(Number(token), false);
    } else {
      pending.push(token);
    }
  }
  flush(0, true);

  return { entries, duplicateNames, invalidStockNames };
}
