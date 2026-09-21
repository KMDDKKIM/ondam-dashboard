// 초진·재초진 등록 누락 대조(순수 로직). 초진환자 해피콜 화면과 홈/메뉴 배지가 같은 규칙을 쓴다.
import { classifyVisit, type FirstVisitCandidateDto, type FirstVisitCandidatesResult, type VisitClassification } from './firstVisit';

/** 후보 한 명의 판정. 일일결산 기반이면 서버가 정한 값을, 예약 명단 기반이면 이전 내원일로 정한다. */
export function candidateSuggestion(candidate: FirstVisitCandidateDto, date: string): VisitClassification {
  return candidate.kind ?? classifyVisit(candidate.previousVisitDates, date);
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
}

/**
 * 대조: 마감 결산에 적힌 초진 수가 있으면 그것을, 없으면 예약 명단에서 초진/재초진으로 추정된 사람 수를 기준으로 삼는다.
 * 일일결산 기반이면 신규환자수(초진)에 재초진 후보를 더한다(신규환자수에는 재초진이 들어 있지 않다).
 * (오늘 새로 만든 재등록 차트의 재초진은 신규환자수에 이미 들어 있으니 더하지 않는다.)
 */
export function reconcileFirstVisits(data: FirstVisitCandidatesResult, registeredCount: number, date: string): FirstVisitReconciliation {
  const suggestions = data.candidates.map((candidate) => ({ candidate, suggestion: candidateSuggestion(candidate, date) }));
  const estimated = suggestions.filter((r) => r.suggestion !== '재진').length;
  const revisitAfter3Months = suggestions.filter((r) => r.suggestion === '재초진' && !r.candidate.countedInNewCount).length;
  const expected =
    data.closingFirstVisitCount != null
      ? data.closingFirstVisitCount + (data.source === 'settlement' ? revisitAfter3Months : 0)
      : estimated;
  const expectedSource =
    data.closingFirstVisitCount != null
      ? data.source === 'settlement'
        ? `일일결산 신규환자수 ${data.closingFirstVisitCount}명 + 재초진 후보 ${revisitAfter3Months}명`
        : '마감 결산 기준'
      : '명단 기준 추정';
  return { expected, expectedSource, registered: registeredCount, missing: Math.max(expected - registeredCount, 0) };
}

/**
 * 홈·메뉴 배지처럼 "정확히 비교할 기준이 있을 때만" 누락을 알리는 경우: 일일결산(내원 환자 명단) 또는 마감 결산의 초진 수가 있어야 한다.
 * 예약 명단만 있으면 아직 오지 않은 사람까지 후보에 들어가 낮 동안 잘못된 누락을 알리게 되므로 비교하지 않는다.
 */
export function hasReliableFirstVisitBasis(data: FirstVisitCandidatesResult): boolean {
  return data.hasRecord && (data.source === 'settlement' || data.closingFirstVisitCount != null);
}
