// 접수기록부에서 초)·재초)로 적힌 환자를 초진환자 해피콜에 자동으로 올릴 계획을 세운다. 순수 함수.
// 원장 결정(2026-10-03): 성함+생년월일이 겹치는 경우는 없다고 보고, 접수기록부의 초진·재초진을 그대로 올리고
// 이후 2진·3진도 성함+생년월일로 이어서 찾는다.

import { birthKey } from './happyCallRevisitFill';

export interface ReceptionEntry {
  visitDate: string;
  patientName: string;
  birthDate: string | null;
  visitKind: '초진' | '재초진' | '재진';
  /** 오늘 오셨지만 예약률 계산에서 빼는 분(진단서만 받아가는 경우 등) — 해피콜 대상이 아니다. */
  excluded: boolean;
}

export interface NewFromReception {
  patientName: string;
  birthDate: string | null;
  firstVisitDate: string;
  visitKind: '초진' | '재초진';
}

/** "건너뛰기" 기록의 키 — 같은 날 같은 이름이면 같은 접수로 본다. */
export function skipKey(visitDate: string, patientName: string): string {
  return `${visitDate}|${patientName.trim()}`;
}

function clean(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  return t === '' ? null : t;
}

/**
 * 접수기록부의 초진·재초진 중 아직 해피콜 표에 없는 사람.
 *  - 이미 같은 날(초진일) 같은 이름으로 등록돼 있으면 올리지 않는다.
 *  - 직원이 해피콜 표에서 지운 사람(skipKeys)은 다시 올리지 않는다.
 *  - "제외" 표시된 접수, 오늘 이후 날짜, 이름이 빈 줄은 뺀다. 같은 날 같은 이름이 두 줄이면 한 명으로 본다.
 */
export function planReceptionRegistrations(
  entries: ReceptionEntry[],
  existing: { patientName: string; firstVisitDate: string }[],
  skipKeys: ReadonlySet<string>,
  today: string
): NewFromReception[] {
  const known = new Set(existing.map((p) => skipKey(p.firstVisitDate, p.patientName)));
  const out: NewFromReception[] = [];
  const sorted = [...entries].sort((a, b) => a.visitDate.localeCompare(b.visitDate));
  for (const e of sorted) {
    if (e.visitKind === '재진' || e.excluded) continue;
    if (e.visitDate > today) continue;
    const name = e.patientName.trim();
    if (!name) continue;
    const key = skipKey(e.visitDate, name);
    if (known.has(key) || skipKeys.has(key)) continue;
    known.add(key);
    out.push({ patientName: name, birthDate: clean(e.birthDate), firstVisitDate: e.visitDate, visitKind: e.visitKind });
  }
  return out;
}

/**
 * 생년월일이 비어 있는 해피콜 환자에게, 초진일 접수 기록(같은 이름)의 생년월일을 채운다. 그날 같은 이름의
 * 접수 기록이 하나이고 생년월일이 적혀 있을 때만(여럿이면 건너뜀). 이후 2진·3진을 성함+생년월일로 찾는 기준이 된다.
 */
export function planBirthFill(
  patients: { id: string; patientName: string; firstVisitDate: string; birthDate?: string | null }[],
  entries: ReceptionEntry[]
): { id: string; birthDate: string }[] {
  const out: { id: string; birthDate: string }[] = [];
  const perDayName = new Map<string, number>();
  for (const p of patients) {
    const key = skipKey(p.firstVisitDate, p.patientName);
    perDayName.set(key, (perDayName.get(key) ?? 0) + 1);
  }
  for (const p of patients) {
    if (clean(p.birthDate)) continue;
    // 같은 날 같은 이름으로 등록된 환자가 둘이면 어느 접수가 누구인지 알 수 없다.
    if ((perDayName.get(skipKey(p.firstVisitDate, p.patientName)) ?? 0) > 1) continue;
    const name = p.patientName.trim();
    const births = new Set(
      entries
        .filter((e) => e.visitDate === p.firstVisitDate && e.patientName.trim() === name)
        .map((e) => clean(e.birthDate))
        .filter((b): b is string => !!b)
    );
    // 표기만 다른 같은 생년월일(80.1.1 / 1980-01-01)은 하나로 본다.
    if (new Set([...births].map(birthKey)).size === 1) out.push({ id: p.id, birthDate: [...births][0] });
  }
  return out;
}

export interface CandidateInfo {
  chartNo: string;
  phone: string;
  doctorName: string;
}

/**
 * 그날 일일결산·예약 명단에서 같은 이름의 후보 하나를 찾아 차트번호·연락처·진료의 이름을 가져온다.
 * 차트번호가 있는 같은 이름 후보가 정확히 한 사람(차트번호 하나)일 때만 — 동명이인이면 틀릴 수 있어 비워 둔다.
 */
export function pickCandidateInfo(patientName: string, candidates: { patientName: string; chartNo: string; phone: string; doctorName: string }[]): CandidateInfo | null {
  const name = patientName.trim();
  const same = candidates.filter((c) => c.patientName.trim() === name && c.chartNo.trim());
  if (same.length === 0) return null;
  if (new Set(same.map((c) => c.chartNo.trim())).size > 1) return null;
  const first = same[0];
  return {
    chartNo: first.chartNo.trim(),
    phone: (same.find((c) => c.phone.trim())?.phone ?? '').trim(),
    doctorName: (same.find((c) => c.doctorName.trim())?.doctorName ?? '').trim(),
  };
}

interface StaffLike {
  id: string;
  name: string;
}

/** 예약·결산의 주치의 이름(예: "김원장")과 진료의 목록을 맞춰 본다. 하나로 정해지지 않으면 빈 문자열. */
export function matchDoctorId(doctorName: string, staffList: StaffLike[]): string {
  const name = doctorName.trim();
  if (!name) return '';
  const exact = staffList.find((s) => s.name === name);
  if (exact) return exact.id;
  const partial = staffList.filter((s) => name.includes(s.name) || s.name.includes(name));
  return partial.length === 1 ? partial[0].id : '';
}
