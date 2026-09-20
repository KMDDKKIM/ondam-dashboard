import { describe, it, expect } from 'vitest';
import {
  computeHerbCallDates,
  computeDietCallDates,
  computeFirstVisitStats,
  computeWeeklyTrend,
  getWeekRange,
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
    revisit3: null,
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

  it('counts a mature patient with all 3 revisits as a triple-visit', () => {
    const patients = [
      makePatient({
        firstVisitDate: '2026-09-01',
        revisit1: '2026-09-05',
        revisit2: '2026-09-10',
        revisit3: '2026-09-15',
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
