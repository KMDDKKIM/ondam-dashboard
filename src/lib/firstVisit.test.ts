import { describe, it, expect } from 'vitest';
import {
  addMonthsKst,
  classifyVisit,
  dedupeVisitCandidates,
  isSamePatient,
  previousVisitDatesFor,
  type ReservationLike,
} from './firstVisit';

describe('addMonthsKst', () => {
  it('subtracts calendar months', () => {
    expect(addMonthsKst('2026-11-30', -3)).toBe('2026-08-30');
    expect(addMonthsKst('2026-02-15', -3)).toBe('2025-11-15');
  });
  it('clamps to the last day of a shorter month', () => {
    expect(addMonthsKst('2026-05-31', -3)).toBe('2026-02-28');
    expect(addMonthsKst('2028-05-31', -3)).toBe('2028-02-29');
  });
});

describe('classifyVisit', () => {
  const today = '2026-09-20';

  it('is 초진(추정) with no history', () => {
    expect(classifyVisit([], today)).toBe('초진(추정)');
  });

  it('is 재진 when the last visit was 2 months ago', () => {
    expect(classifyVisit(['2026-07-20', '2026-01-05'], today)).toBe('재진');
  });

  it('is 재초진 at exactly 3 calendar months', () => {
    expect(classifyVisit(['2026-06-20'], today)).toBe('재초진');
  });

  it('is 재진 one day short of 3 months', () => {
    expect(classifyVisit(['2026-06-21'], today)).toBe('재진');
  });

  it('is 재초진 at 5 months', () => {
    expect(classifyVisit(['2026-04-20'], today)).toBe('재초진');
  });

  it('judges by the LAST visit, not the first', () => {
    expect(classifyVisit(['2025-01-10', '2026-08-30'], today)).toBe('재진');
  });

  it('ignores same-day duplicates of today', () => {
    expect(classifyVisit([today, today], today)).toBe('초진(추정)');
    expect(classifyVisit([today, '2026-04-20'], today)).toBe('재초진');
  });

  it('counts duplicated earlier dates once', () => {
    expect(classifyVisit(['2026-04-20', '2026-04-20'], today)).toBe('재초진');
  });

  it('handles month-end edges', () => {
    expect(classifyVisit(['2026-08-30'], '2026-11-30')).toBe('재초진');
    expect(classifyVisit(['2026-08-31'], '2026-11-30')).toBe('재진');
    expect(classifyVisit(['2026-02-28'], '2026-05-31')).toBe('재초진');
    expect(classifyVisit(['2026-03-01'], '2026-05-31')).toBe('재진');
  });
});

describe('isSamePatient', () => {
  it('uses chart number when both have one', () => {
    expect(isSamePatient({ name: '김', chartNo: '1' }, { name: '이', chartNo: '1' })).toBe(true);
    expect(isSamePatient({ name: '김', chartNo: '1' }, { name: '김', chartNo: '2' })).toBe(false);
  });
  it('falls back to name + phone', () => {
    expect(isSamePatient({ name: '김', phones: ['010-1111-2222'] }, { name: '김', phones: ['01011112222'] })).toBe(true);
    expect(isSamePatient({ name: '김', phones: ['010-1111-2222'] }, { name: '김', phones: ['010-3333-4444'] })).toBe(false);
    expect(isSamePatient({ name: '김', chartNo: '1', phones: ['010'] }, { name: '박', phones: ['010'] })).toBe(false);
  });
});

describe('dedupeVisitCandidates / previousVisitDatesFor', () => {
  const row = (o: Partial<ReservationLike>): ReservationLike => ({
    patientName: '김',
    chartNo: '',
    phone: '',
    mobile: '',
    visitStatus: '',
    doctorName: '원장',
    timeLabel: '09:00',
    ...o,
  });

  it('drops cancelled rows and merges same-day duplicates', () => {
    const list = dedupeVisitCandidates([
      row({ chartNo: '10', mobile: '010-1' }),
      row({ chartNo: '10', timeLabel: '15:00' }),
      row({ patientName: '박', chartNo: '11', visitStatus: '취소' }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].phone).toBe('010-1');
  });

  it('collects sorted unique earlier dates for a candidate', () => {
    const cand = { patientName: '김', chartNo: '10', phone: '', doctorName: '', timeLabel: '' };
    const prior = [
      { date: '2026-05-01', patientName: '김', chartNo: '10', phone: '', mobile: '' },
      { date: '2026-05-01', patientName: '김', chartNo: '10', phone: '', mobile: '' },
      { date: '2026-03-01', patientName: '김', chartNo: '10', phone: '', mobile: '' },
      { date: '2026-05-02', patientName: '이', chartNo: '99', phone: '', mobile: '' },
      { date: '2026-09-20', patientName: '김', chartNo: '10', phone: '', mobile: '' },
    ];
    expect(previousVisitDatesFor(cand, prior, '2026-09-20')).toEqual(['2026-03-01', '2026-05-01']);
  });
});
