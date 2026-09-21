// 초진·재초진 등록 누락 대조(순수 로직). 초진환자 해피콜 화면과 홈/메뉴 배지가 같은 규칙을 쓴다.
import {
  classifyVisit,
  isSamePatient,
  type FirstVisitCandidateDto,
  type FirstVisitCandidatesResult,
  type VisitClassification,
} from './firstVisit';

/** 후보 한 명의 판정. 일일결산 기반이면 서버가 정한 값을, 예약 명단 기반이면 이전 내원일로 정한다. */
export function candidateSuggestion(candidate: FirstVisitCandidateDto, date: string): VisitClassification {
  return candidate.kind ?? classifyVisit(candidate.previousVisitDates, date);
}

/** 이미 등록된 해피콜 환자에서 이름·차트번호·연락처만. */
export interface RegisteredLike {
  patientName: string;
  chartNo?: string | null;
  phone?: string | null;
}

/**
 * 결산·예약 명단에서 온 후보가 이미 등록된 환자인가.
 * 차트번호/전화번호로 같은 사람이 확인되거나, 차트번호·연락처 없이 이름만 등록해 둔 줄은 그날 후보 중 같은 이름이 한 명뿐일 때 그 사람으로 본다.
 */
export function matchesRegisteredPatient(candidate: FirstVisitCandidateDto, patient: RegisteredLike, sameNameCandidates: number): boolean {
  const person = { name: candidate.patientName, chartNo: candidate.chartNo, phones: [candidate.phone] };
  return (
    isSamePatient(person, { name: patient.patientName, chartNo: patient.chartNo, phones: [patient.phone] }) ||
    (!patient.chartNo && !patient.phone && patient.patientName === candidate.patientName && sameNameCandidates === 1)
  );
}

export interface RegisteredMatch {
  /** 이미 등록된 환자와 같은 사람으로 본 후보 */
  registered: Set<FirstVisitCandidateDto>;
  /** 이름이 같은 등록 환자가 있지만(차트번호·연락처가 있어서) 같은 사람인지 확인할 수 없는 접수 후보 — "동명이인 가능"으로 보여 준다 */
  possibleHomonym: Set<FirstVisitCandidateDto>;
}

/**
 * 어느 후보가 이미 등록된 환자인지를 한 번에 정한다. 등록 환자 한 명은 후보 한 명에게만 짝지어진다.
 * 접수기록부에서 온 후보는 차트번호가 없으니, 결산 후보와 먼저 짝지어진 등록 환자를 뺀 나머지 중에서:
 * - 차트번호도 연락처도 없이 이름만 등록된 환자와 이름이 정확히 같으면 같은 사람으로 본다.
 * - 이름이 같아도 그 등록 환자에게 차트번호나 연락처가 있으면 같은 사람이라는 근거가 없으므로 등록됨 처리하지 않고 "동명이인 가능"으로 남긴다.
 * - 이미 "동명이인 가능"인 접수 후보는 그대로 보이게 둔다.
 */
export function matchRegisteredCandidates(candidates: FirstVisitCandidateDto[], registered: RegisteredLike[]): RegisteredMatch {
  const matched = new Set<FirstVisitCandidateDto>();
  const homonym = new Set<FirstVisitCandidateDto>();
  const used = new Set<RegisteredLike>();
  const listed = candidates.filter((c) => !c.fromReception);
  for (const candidate of listed) {
    const sameName = listed.filter((c) => c.patientName === candidate.patientName).length;
    const match = registered.find((p) => !used.has(p) && matchesRegisteredPatient(candidate, p, sameName));
    if (match) {
      used.add(match);
      matched.add(candidate);
    }
  }
  for (const candidate of candidates) {
    if (!candidate.fromReception || candidate.possibleHomonym) continue;
    const name = candidate.patientName.trim();
    const sameName = registered.filter((p) => !used.has(p) && p.patientName.trim() === name);
    const nameOnly = sameName.find((p) => !(p.chartNo ?? '').trim() && !(p.phone ?? '').trim());
    if (nameOnly) {
      used.add(nameOnly);
      matched.add(candidate);
    } else if (sameName.length > 0) {
      homonym.add(candidate);
    }
  }
  return { registered: matched, possibleHomonym: homonym };
}

export interface FirstVisitReconciliation {
  /** 등록돼 있어야 할 초진·재초진 수 */
  expected: number;
  /** 어디서 나온 기준인지(화면 안내 문구) */
  expectedSource: string;
  /** 이미 등록된 수 */
  registered: number;
  /** 아직 등록하지 않은 수(0 이상) */
  missing: number;
  /** 접수기록부에 초로 적힌 사람이 결산 신규환자수보다 많을 때 그 차이(아니면 0). 알림용 — 경고가 아니다. */
  receptionMore: number;
}

/**
 * 대조: 마감 결산에 적힌 초진 수가 있으면 그것을, 없으면 명단에서 초진/재초진으로 추정된 사람 수를 기준으로 삼는다.
 * 일일결산 기반이면 신규환자수(초진)에 재초진 후보를 더한다(신규환자수에는 재초진이 들어 있지 않다).
 * (오늘 새로 만든 재등록 차트의 재초진은 신규환자수에 이미 들어 있으니 더하지 않는다.)
 * 접수기록부에서만 나온 후보(결산·예약 명단과 겹치지 않는 사람)는 등록 여부와 상관없이 모두 기준에 더해서 센다
 * (이미 등록된 접수 후보는 registeredCount 에도 들어 있으므로 양쪽에 똑같이 잡힌다).
 * 결산 신규환자수 없이 예약 명단만 있고 접수기록부에 초/재초가 있으면, 접수기록부(실제로 온 사람)의 수를 기준으로 삼는다.
 */
export function reconcileFirstVisits(data: FirstVisitCandidatesResult, registeredCount: number, date: string): FirstVisitReconciliation {
  const suggestions = data.candidates.map((candidate) => ({ candidate, suggestion: candidateSuggestion(candidate, date) }));
  const estimated = suggestions.filter((r) => r.suggestion !== '재진').length;
  const revisitAfter3Months = suggestions.filter(
    (r) => r.suggestion === '재초진' && !r.candidate.countedInNewCount && !r.candidate.fromReception
  ).length;
  const receptionExtras = data.candidates.filter((c) => c.fromReception).length;
  const receptionTotal = receptionRowCount(data);
  const closing = data.closingFirstVisitCount;
  // 예약 명단은 아직 오지 않은 사람까지 들어 있어서, 결산 없이 접수기록부가 있으면 접수기록부를 기준으로 삼는다.
  const receptionBasis = closing == null && data.source === 'reservation' && receptionTotal > 0;

  const expected = receptionBasis
    ? receptionTotal
    : closing != null
      ? closing + (data.source === 'settlement' ? revisitAfter3Months : 0) + receptionExtras
      : estimated;
  let expectedSource: string;
  if (receptionBasis) {
    expectedSource = '접수기록부 기준';
  } else if (closing != null) {
    expectedSource = data.source === 'settlement' ? `일일결산 신규환자수 ${closing}명 + 재초진 후보 ${revisitAfter3Months}명` : '마감 결산 기준';
    if (receptionExtras > 0) expectedSource += ` + 접수기록부에만 있는 ${receptionExtras}명`;
  } else {
    expectedSource = data.source === 'reception' ? '접수기록부 기준' : '명단 기준 추정';
  }
  const receptionMore = closing != null ? Math.max((data.receptionFirstCount ?? 0) - closing, 0) : 0;
  return { expected, expectedSource, registered: registeredCount, missing: Math.max(expected - registeredCount, 0), receptionMore };
}

/**
 * 홈·메뉴 배지처럼 "정확히 비교할 기준이 있을 때만" 누락을 알리는 경우: 일일결산(내원 환자 명단) 또는 마감 결산의 초진 수,
 * 또는 접수기록부의 초/재초 줄(실제로 온 사람만 적으므로)이 있어야 한다.
 * 예약 명단만 있으면 아직 오지 않은 사람까지 후보에 들어가 낮 동안 잘못된 누락을 알리게 되므로 비교하지 않는다.
 */
export function hasReliableFirstVisitBasis(data: FirstVisitCandidatesResult): boolean {
  return (
    data.hasRecord &&
    (data.source === 'settlement' || data.source === 'reception' || data.closingFirstVisitCount != null || receptionRowCount(data) > 0)
  );
}

/** 접수기록부에 초/재초로 적힌 사람 수(같은 사람의 중복 줄은 하나). */
function receptionRowCount(data: FirstVisitCandidatesResult): number {
  return (data.receptionFirstCount ?? 0) + (data.receptionRevisitCount ?? 0);
}
