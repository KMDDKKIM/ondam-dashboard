import { describe, it, expect } from 'vitest';
import {
  computeHerbCallDates,
  computeDietCallDates,
  computeFirstVisitStats,
  computeWeeklyTrend,
  countUnreconciledRevisits,
  getWeekRange,
  isUnreconciledRevisit,
  isTripleVisit,
  lastCompletedWeekRange,
  latestFullyMatureWeekStart,
} from './happyCallStats';
import type { HappyCallPatient } from './types';

describe('computeHerbCallDates', () => {
  it('computes call dates for a 15-day prescription', () => {
    expect(computeHerbCallDates('2026-09-01', 15)).toEqual({
      callDate1: '2026-09-02',
      callDate2: '2026-09-08',
      callDate3: '2026-09-13',
    });
  });

  it('computes call dates for a 30-day prescription', () => {
    expect(computeHerbCallDates('2026-09-01', 30)).toEqual({
      callDate1: '2026-09-02',
      callDate2: '2026-09-16',
      callDate3: '2026-09-28',
    });
  });

  it('clamps call_date_3 to call_date_1 when duration is very short', () => {
    const result = computeHerbCallDates('2026-09-01', 2);
    expect(result.callDate3 >= result.callDate1).toBe(true);
    expect(result.callDate3).toBe(result.callDate1);
  });
});

describe('computeDietCallDates', () => {
  it('returns 7 dates starting the day after detox_start_date', () => {
    expect(computeDietCallDates('2026-09-01')).toEqual([
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
    ]);
  });
});

function makePatient(overrides: Partial<HappyCallPatient>): HappyCallPatient {
  return {
    id: 'test-id',
    patientName: '테스트',
    doctorStaffId: null,
    patientType: '건보',
    acupunctureSuccess: null,
    firstVisitDate: '2026-09-01',
    revisit1: null,
    revisit2: null,
    jaboHerb1: null,
    jaboHerb2: null,
    jaboHerb3: null,
    nextVisitNote: null,
    callLog: null,
    memo: null,
    createdBy: null,
    createdAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('computeFirstVisitStats', () => {
  it('returns all zeros for an empty patient list', () => {
    expect(computeFirstVisitStats([], '2026-09-22')).toEqual({
      patientCount: 0,
      revisitRate: 0,
      dropoutRate: 0,
      tripleVisitRate: 0,
      matureCount: 0,
    });
  });

  it('excludes patients younger than 3 weeks from dropout/triple calculations', () => {
    const patients = [makePatient({ firstVisitDate: '2026-09-20' })];
    const stats = computeFirstVisitStats(patients, '2026-09-22');
    expect(stats.patientCount).toBe(1);
    expect(stats.matureCount).toBe(0);
    expect(stats.dropoutRate).toBe(0);
  });

  it('counts a mature patient with no revisit as a dropout', () => {
    const patients = [makePatient({ firstVisitDate: '2026-09-01' })];
    const stats = computeFirstVisitStats(patients, '2026-09-22');
    expect(stats.matureCount).toBe(1);
    expect(stats.dropoutRate).toBe(1);
    expect(stats.tripleVisitRate).toBe(0);
  });

  it('counts a mature patient with 2진 and 3진 as a triple-visit', () => {
    const patients = [
      makePatient({
        firstVisitDate: '2026-09-01',
        revisit1: '2026-09-05',
        revisit2: '2026-09-10',
      }),
    ];
    const stats = computeFirstVisitStats(patients, '2026-09-22');
    expect(stats.matureCount).toBe(1);
    expect(stats.dropoutRate).toBe(0);
    expect(stats.tripleVisitRate).toBe(1);
    expect(stats.revisitRate).toBe(1);
  });

  it('counts revisit rate for patients with at least one revisit, regardless of maturity', () => {
    const patients = [makePatient({ firstVisitDate: '2026-09-20', revisit1: '2026-09-21' })];
    const stats = computeFirstVisitStats(patients, '2026-09-22');
    expect(stats.revisitRate).toBe(1);
    expect(stats.matureCount).toBe(0);
  });
});

describe('computeWeeklyTrend', () => {
  it('returns the most recent week first, one week per patient bucket', () => {
    const patients = [
      makePatient({ id: 'a', firstVisitDate: '2026-09-15' }), // week of 09-14~09-20
      makePatient({ id: 'b', firstVisitDate: '2026-09-08' }), // week of 09-07~09-13
    ];
    const trend = computeWeeklyTrend(patients, '2026-09-18', '2026-09-18', 3);
    expect(trend).toHaveLength(3);
    expect(trend[0]).toMatchObject({ start: '2026-09-14', end: '2026-09-20' });
    expect(trend[0].stats.patientCount).toBe(1);
    expect(trend[1]).toMatchObject({ start: '2026-09-07', end: '2026-09-13' });
    expect(trend[1].stats.patientCount).toBe(1);
    expect(trend[2].stats.patientCount).toBe(0);
  });
});

describe('getWeekRange', () => {
  it('returns a 7-day range containing the input date', () => {
    const { start, end } = getWeekRange('2026-09-18');
    expect(start <= '2026-09-18').toBe(true);
    expect(end >= '2026-09-18').toBe(true);
    const diffDays = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
    expect(diffDays).toBe(6);
  });

  it('starts on a Monday and ends on a Sunday', () => {
    const { start, end } = getWeekRange('2026-09-18');
    expect(new Date(start).getUTCDay()).toBe(1);
    expect(new Date(end).getUTCDay()).toBe(0);
  });
});

describe('isTripleVisit (1진 + 2진 + 3진 within 21 days after the first visit)', () => {
  const base = { firstVisitDate: '2026-09-01' };

  it('accepts the 3진 visit exactly 21 days after the first', () => {
    expect(isTripleVisit(makePatient({ ...base, revisit1: '2026-09-05', revisit2: '2026-09-22' }))).toBe(true);
  });

  it('rejects the 3진 visit on day 22', () => {
    expect(isTripleVisit(makePatient({ ...base, revisit1: '2026-09-05', revisit2: '2026-09-23' }))).toBe(false);
  });

  it('rejects when 3진 is missing', () => {
    expect(isTripleVisit(makePatient({ ...base, revisit1: '2026-09-05' }))).toBe(false);
  });

  it('is judged by the latest date even if the revisit columns are out of order', () => {
    expect(isTripleVisit(makePatient({ ...base, revisit1: '2026-09-30', revisit2: '2026-09-05' }))).toBe(false);
  });

  it('feeds tripleVisitRate: a late third visit is not a triple', () => {
    const late = makePatient({ ...base, revisit1: '2026-09-05', revisit2: '2026-09-25' });
    const stats = computeFirstVisitStats([late], '2026-10-01');
    expect(stats.matureCount).toBe(1);
    expect(stats.tripleVisitRate).toBe(0);
    expect(stats.dropoutRate).toBe(0);
  });
});

describe('countUnreconciledRevisits', () => {
  it('isUnreconciledRevisit uses the same 21-day rule', () => {
    expect(isUnreconciledRevisit(makePatient({ firstVisitDate: '2026-08-30' }), '2026-09-20')).toBe(true);
    expect(isUnreconciledRevisit(makePatient({ firstVisitDate: '2026-08-31' }), '2026-09-20')).toBe(false);
  });

  it('counts only matured patients with no revisit date at all', () => {
    const patients = [
      makePatient({ id: 'a', firstVisitDate: '2026-08-20' }), // matured, empty
      makePatient({ id: 'b', firstVisitDate: '2026-08-20', revisit2: '2026-09-01' }), // has a date
      makePatient({ id: 'c', firstVisitDate: '2026-09-15' }), // not matured
      makePatient({ id: 'd', firstVisitDate: '2026-08-30' }), // exactly 21 days
    ];
    expect(countUnreconciledRevisits(patients, '2026-09-20')).toBe(2);
  });
});

describe('lastCompletedWeekRange', () => {
  it('returns the previous Mon-Sun week on a Sunday (the current week is not over)', () => {
    expect(lastCompletedWeekRange('2026-09-20')).toEqual({ start: '2026-09-07', end: '2026-09-13' });
  });
  it('returns the previous week on a Monday', () => {
    expect(lastCompletedWeekRange('2026-09-21')).toEqual({ start: '2026-09-14', end: '2026-09-20' });
  });
  it('returns the previous week midweek', () => {
    expect(lastCompletedWeekRange('2026-09-23')).toEqual({ start: '2026-09-14', end: '2026-09-20' });
  });
});

describe('latestFullyMatureWeekStart', () => {
  it('주의 마지막 날로부터 21일이 지난 가장 최근 주의 월요일', () => {
    // 2026-09-21(월): 8/24~8/30 주는 9/20 부터 성숙, 8/31~9/6 주는 9/27 부터
    expect(latestFullyMatureWeekStart('2026-09-21')).toBe('2026-08-24');
    expect(latestFullyMatureWeekStart('2026-09-26')).toBe('2026-08-24');
    expect(latestFullyMatureWeekStart('2026-09-27')).toBe('2026-08-31');
  });
});
