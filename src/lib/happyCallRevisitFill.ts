// 접수기록부(reception_records)의 날짜별 내원 기록으로 초진환자 해피콜의 2진·3진(재내원 날짜)을 채울 계획을
// 세운다. 순수 함수. 표의 "1진"은 초진일(firstVisitDate)이라 등록할 때 이미 들어가 있다.
//
// 같은 사람은 성함+생년월일로 가린다(원장 확인: 성함과 생년월일이 모두 같은 두 사람은 없다).
// 안전 장치 — 틀리게 채우느니 비워 둔다:
//  - 생년월일이 없는 환자는 건너뛴다(같은 이름의 다른 사람 내원을 넣을 수 있어서).
//  - 접수기록부가 시작되기 전(coverageStart 이전)에 초진인 환자는 건너뛴다. 그 사이의 내원을 몰라서, 뒤늦게
//    기록된 내원을 "2진"으로 잘못 넣을 수 있기 때문이다.
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
  birthDate?: string | null;
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
  /** 생년월일이 없어 건너뛴 환자 수(재내원 날짜가 비어 있는 경우만). */
  noBirth: number;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * 생년월일 표기를 하나로 맞춘다 — 접수기록부에는 "80.1.1" · "1980-01-01" · "800101"처럼 날마다 다르게 적혀 있어
 * 같은 사람이 다른 사람처럼 보이기 때문이다. 연도는 뒤 두 자리, 월·일은 숫자로("80.1.1"). 읽을 수 없는 표기는 그대로 둔다.
 */
export function birthKey(birth: string | null | undefined): string {
  const t = clean(birth);
  if (!t) return '';
  let parts = t.split(/[.\-/\s]+/).filter(Boolean);
  if (parts.length === 1) {
    const m = t.match(/^(\d{2}|\d{4})(\d{2})(\d{2})$/);
    if (m) parts = [m[1], m[2], m[3]];
  }
  if (parts.length !== 3 || parts.some((x) => !/^\d+$/.test(x))) return t;
  return `${parts[0].slice(-2)}.${Number(parts[1])}.${Number(parts[2])}`;
}

/** 성함+생년월일 키. 생년월일이 비어 있으면 null — 같은 사람으로 가릴 수 없다. */
export function personKey(name: string, birth: string | null | undefined): string | null {
  const n = clean(name);
  const b = birthKey(birth);
  return n && b ? `${n}|${b}` : null;
}

export function planRevisitFill(patients: RevisitTarget[], visits: ReceptionVisit[], coverageStart: string, today: string): RevisitFillPlan {
  const datesByPerson = new Map<string, Set<string>>();
  for (const v of visits) {
    if (v.excluded) continue;
    const key = personKey(v.patientName, v.birthDate);
    if (!key) continue;
    const set = datesByPerson.get(key) ?? new Set<string>();
    set.add(v.visitDate);
    datesByPerson.set(key, set);
  }

  const fills: RevisitFill[] = [];
  let beforeCoverage = 0;
  let noBirth = 0;

  for (const p of patients) {
    if (p.revisit1 && p.revisit2) continue;
    if (p.firstVisitDate < coverageStart) {
      beforeCoverage++;
      continue;
    }
    const key = personKey(p.patientName, p.birthDate);
    if (!key) {
      noBirth++;
      continue;
    }

    const used = new Set([p.revisit1, p.revisit2].filter((d): d is string => !!d));
    const dates = [...(datesByPerson.get(key) ?? [])].filter((d) => d > p.firstVisitDate && d <= today && !used.has(d)).sort();
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
  return { fills, beforeCoverage, noBirth };
}
