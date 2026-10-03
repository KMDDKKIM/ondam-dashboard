// 접수기록부(reception_records)의 날짜별 내원 기록으로 초진환자 해피콜의 2진·3진(재내원 날짜)을 채울 계획을
// 세운다. 순수 함수. 표의 "1진"은 초진일(firstVisitDate)이라 등록할 때 이미 들어가 있다.
//
// 안전 장치 — 틀리게 채우느니 비워 둔다:
//  - 접수기록부가 시작되기 전(coverageStart 이전)에 초진인 환자는 건너뛴다. 그 사이의 내원을 몰라서, 뒤늦게
//    기록된 내원을 "2진"으로 잘못 넣을 수 있기 때문이다.
//  - 접수기록부엔 차트번호가 없어 이름으로 찾는다. 같은 이름의 해피콜 환자가 둘 이상이거나, 같은 이름의
//    다른 생년월일이 섞이면 건너뛴다(생년월일이 같은 기록만 같은 사람으로 본다).
//  - "제외" 표시된 내원(진단서만 받아가는 경우 등)은 재내원으로 세지 않는다.
//  - 이미 적힌 날짜는 바꾸지 않고 빈 칸만 채운다.

export interface ReceptionVisit {
  visitDate: string;
  patientName: string;
  birthDate: string | null;
  excluded: boolean;
}

export interface RevisitTarget {
  id: string;
  patientName: string;
  firstVisitDate: string;
  revisit1?: string | null;
  revisit2?: string | null;
}

export interface RevisitFill {
  id: string;
  revisit1?: string;
  revisit2?: string;
}

export interface RevisitFillPlan {
  fills: RevisitFill[];
  /** 접수기록부 시작 전에 초진이라 건너뛴 환자 수(재내원 날짜가 비어 있는 경우만). */
  beforeCoverage: number;
  /** 같은 이름이 섞여 누구 내원인지 가릴 수 없어 건너뛴 환자 수. */
  ambiguous: number;
}

function clean(birth: string | null): string | null {
  const t = (birth ?? '').trim();
  return t === '' ? null : t;
}

export function planRevisitFill(patients: RevisitTarget[], visits: ReceptionVisit[], coverageStart: string, today: string): RevisitFillPlan {
  const nameCount = new Map<string, number>();
  for (const p of patients) {
    const name = p.patientName.trim();
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }
  const visitsByName = new Map<string, ReceptionVisit[]>();
  for (const v of visits) {
    const name = v.patientName.trim();
    visitsByName.set(name, [...(visitsByName.get(name) ?? []), v]);
  }

  const fills: RevisitFill[] = [];
  let beforeCoverage = 0;
  let ambiguous = 0;

  for (const p of patients) {
    if (p.revisit1 && p.revisit2) continue;
    if (p.firstVisitDate < coverageStart) {
      beforeCoverage++;
      continue;
    }
    const name = p.patientName.trim();
    const sameName = visitsByName.get(name) ?? [];
    const duplicate = (nameCount.get(name) ?? 0) > 1;

    // 초진일 접수 기록의 생년월일로 같은 사람을 가린다.
    const anchorBirths = [...new Set(sameName.filter((v) => v.visitDate === p.firstVisitDate).map((v) => clean(v.birthDate)).filter((b): b is string => !!b))];
    if (anchorBirths.length > 1) {
      ambiguous++;
      continue;
    }
    const birth = anchorBirths[0] ?? null;
    if (duplicate && !birth) {
      ambiguous++;
      continue;
    }

    const later = sameName.filter((v) => !v.excluded && v.visitDate > p.firstVisitDate && v.visitDate <= today);
    let mine: ReceptionVisit[];
    if (birth) {
      // 같은 생년월일이면 같은 사람. 생년월일을 안 적은 기록은 같은 이름이 해피콜 표에 하나뿐일 때만 같은 사람으로 본다.
      mine = later.filter((v) => clean(v.birthDate) === birth || (!duplicate && clean(v.birthDate) === null));
    } else {
      const births = new Set(later.map((v) => clean(v.birthDate)).filter((b): b is string => !!b));
      if (births.size > 1) {
        ambiguous++;
        continue;
      }
      mine = later;
    }

    const used = new Set([p.revisit1, p.revisit2].filter((d): d is string => !!d));
    const dates = [...new Set(mine.map((v) => v.visitDate))].sort().filter((d) => !used.has(d));
    const fill: RevisitFill = { id: p.id };
    if (!p.revisit1) {
      const pick = dates.find((d) => !p.revisit2 || d < p.revisit2);
      if (pick) {
        fill.revisit1 = pick;
        dates.splice(dates.indexOf(pick), 1);
      }
    }
    if (!p.revisit2) {
      const after = fill.revisit1 ?? p.revisit1 ?? p.firstVisitDate;
      const pick = dates.find((d) => d > after);
      if (pick) fill.revisit2 = pick;
    }
    if (fill.revisit1 || fill.revisit2) fills.push(fill);
  }
  return { fills, beforeCoverage, ambiguous };
}
