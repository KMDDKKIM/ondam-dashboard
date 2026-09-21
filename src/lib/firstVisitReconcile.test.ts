import { describe, expect, it } from 'vitest';
import { hasReliableFirstVisitBasis, reconcileFirstVisits } from './firstVisitReconcile';
import type { FirstVisitCandidateDto, FirstVisitCandidatesResult } from './firstVisit';

const DATE = '2026-09-22';

function cand(over: Partial<FirstVisitCandidateDto> = {}): FirstVisitCandidateDto {
  return {
    patientName: '홍길동',
    chartNo: '',
    phone: '',
    doctorName: '',
    timeLabel: '',
    previousVisitDates: [],
    possibleHomonym: false,
    ...over,
  } as FirstVisitCandidateDto;
}

function result(over: Partial<FirstVisitCandidatesResult>): FirstVisitCandidatesResult {
  return { date: DATE, hasRecord: true, closingFirstVisitCount: null, candidates: [], ...over };
}

describe('reconcileFirstVisits', () => {
  it('마감 결산 초진 수가 있으면 그것을 기준으로 삼는다', () => {
    const r = reconcileFirstVisits(result({ source: 'reservation', closingFirstVisitCount: 3 }), 1, DATE);
    expect(r).toMatchObject({ expected: 3, registered: 1, missing: 2, expectedSource: '마감 결산 기준' });
  });

  it('일일결산 기반이면 신규환자수에 재초진 후보를 더한다(신규 차트에 이미 든 재초진은 제외)', () => {
    const data = result({
      source: 'settlement',
      closingFirstVisitCount: 2,
      candidates: [
        cand({ patientName: 'A', kind: '재초진', countedInNewCount: false }),
        cand({ patientName: 'B', kind: '재초진', countedInNewCount: true }),
        cand({ patientName: 'C', kind: '재진' }),
      ],
    });
    const r = reconcileFirstVisits(data, 2, DATE);
    expect(r.expected).toBe(3);
    expect(r.missing).toBe(1);
  });

  it('결산 수가 없으면 명단에서 추정한 초진/재초진 수를 쓴다', () => {
    const data = result({
      source: 'reservation',
      candidates: [cand({ patientName: 'A' }), cand({ patientName: 'B', previousVisitDates: ['2026-09-01'] })],
    });
    const r = reconcileFirstVisits(data, 0, DATE);
    expect(r.expected).toBe(1);
    expect(r.expectedSource).toBe('명단 기준 추정');
  });

  it('등록이 더 많아도 누락은 0 아래로 내려가지 않는다', () => {
    expect(reconcileFirstVisits(result({ closingFirstVisitCount: 1 }), 4, DATE).missing).toBe(0);
  });
});

describe('hasReliableFirstVisitBasis', () => {
  it('명단이 없으면 비교하지 않는다', () => {
    expect(hasReliableFirstVisitBasis(result({ hasRecord: false }))).toBe(false);
  });
  it('일일결산 기반이거나 마감 초진 수가 있으면 비교한다', () => {
    expect(hasReliableFirstVisitBasis(result({ source: 'settlement' }))).toBe(true);
    expect(hasReliableFirstVisitBasis(result({ source: 'reservation', closingFirstVisitCount: 0 }))).toBe(true);
  });
  it('예약 명단만 있으면 비교하지 않는다', () => {
    expect(hasReliableFirstVisitBasis(result({ source: 'reservation' }))).toBe(false);
  });
});
