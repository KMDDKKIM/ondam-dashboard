import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { listHappyCallPatientsByFirstVisitDate } from '@/lib/supabase/happyCallPatients';
import { hasReliableFirstVisitBasis, reconcileFirstVisits } from '@/lib/firstVisitReconcile';
import { getFirstVisitCandidates } from './firstVisitCandidates.server';

export type FirstVisitMissingResult =
  /** 비교할 결산/명단이 없다 — 화면에서 감춘다. */
  | { comparable: false }
  | { comparable: true; expected: number; registered: number; missing: number };

/**
 * 그 날짜의 초진·재초진 등록 누락 수. /api/first-visit-candidates 와 같은 후보 함수(getFirstVisitCandidates)와
 * 초진환자 해피콜 화면과 같은 대조 함수(reconcileFirstVisits)를 쓴다. 조회에 실패하면 throw 한다.
 * 같은 요청 안에서 메뉴 배지와 홈이 함께 부르므로 React cache 로 한 번만 계산한다.
 */
export const getFirstVisitMissing = cache(async (date: string): Promise<FirstVisitMissingResult> => {
  const supabase = await createClient();
  const [data, registered] = await Promise.all([getFirstVisitCandidates(date), listHappyCallPatientsByFirstVisitDate(supabase, date)]);
  if (!hasReliableFirstVisitBasis(data)) return { comparable: false };
  const r = reconcileFirstVisits(data, registered.length, date, registered);
  return { comparable: true, expected: r.expected, registered: r.registered, missing: r.missing };
});
