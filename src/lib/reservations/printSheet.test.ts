import { describe, expect, it } from 'vitest';
import { countByDoctor, flattenForPrint, groupByDoctor, printFontPt, shouldStartPrint, visitMarkerFor, UNASSIGNED_DOCTOR } from './printSheet';
import type { Reservation } from './types';
import type { FirstVisitCandidateDto } from '../firstVisit';

function res(over: Partial<Reservation>): Reservation {
  return {
    doctorName: '김동규',
    timeLabel: '10:00',
    patientName: '온달',
    chartNo: '000002',
    phone: '',
    mobile: '010-0000-0001',
    visitStatus: '',
    treatmentArea: '통원',
    treatment: '침',
    specialNotes: '',
    memo: '',
    ...over,
  };
}

function cand(over: Partial<FirstVisitCandidateDto>): FirstVisitCandidateDto {
  return {
    patientName: '온달',
    chartNo: '000002',
    phone: '010-0000-0001',
    doctorName: '김동규',
    timeLabel: '10:00',
    previousVisitDates: [],
    possibleHomonym: false,
    ...over,
  };
}

describe('groupByDoctor', () => {
  it('groups by doctor, sorts rows by time, puts unassigned last and drops cancelled', () => {
    const sheets = groupByDoctor([
      res({ doctorName: '박소은', timeLabel: '11:00', patientName: 'c' }),
      res({ doctorName: '김동규', timeLabel: '15:00', patientName: 'b' }),
      res({ doctorName: '', timeLabel: '09:00', patientName: 'u' }),
      res({ doctorName: '김동규', timeLabel: '09:30', patientName: 'a' }),
      res({ doctorName: '김동규', timeLabel: '10:00', patientName: 'x', visitStatus: '취소' }),
    ]);
    expect(sheets.map((s) => s.doctorName)).toEqual(['김동규', '박소은', UNASSIGNED_DOCTOR]);
    expect(sheets[0].rows.map((r) => r.patientName)).toEqual(['a', 'b']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupByDoctor([])).toEqual([]);
  });
});

describe('visitMarkerFor', () => {
  const date = '2026-09-21';

  it('marks 초진 when the patient has no earlier visit on record', () => {
    expect(visitMarkerFor(res({}), [cand({})], date)).toBe('초진');
  });

  it('marks 초진? when only an unverifiable same-name record exists', () => {
    expect(visitMarkerFor(res({}), [cand({ possibleHomonym: true })], date)).toBe('초진?');
  });

  it('marks 재초진 when the last visit was 3+ months ago, nothing for a regular return', () => {
    expect(visitMarkerFor(res({}), [cand({ previousVisitDates: ['2026-05-01'] })], date)).toBe('재초진');
    expect(visitMarkerFor(res({}), [cand({ previousVisitDates: ['2026-09-10'] })], date)).toBeNull();
  });

  it('marks 초진? when the row has neither chart number nor phone (cannot be checked)', () => {
    expect(visitMarkerFor(res({ chartNo: '', mobile: '', phone: '' }), [cand({})], date)).toBe('초진?');
  });

  it('shows nothing when candidates are unavailable or the row is not a candidate', () => {
    expect(visitMarkerFor(res({}), null, date)).toBeNull();
    expect(visitMarkerFor(res({ chartNo: '999' }), [cand({})], date)).toBeNull();
  });
});

describe('shouldStartPrint', () => {
  const request = { date: '2026-09-21', id: 1 };

  it('starts only for the requested date, once loaded and not yet handled', () => {
    expect(shouldStartPrint(request, '2026-09-21', false, 0)).toBe(true);
    expect(shouldStartPrint(request, '2026-09-21', true, 0)).toBe(false);
    expect(shouldStartPrint(request, '2026-09-22', false, 0)).toBe(false);
    expect(shouldStartPrint(request, '2026-09-21', false, 1)).toBe(false);
  });

  it('does nothing without a request (later date changes do not reopen the print dialog)', () => {
    expect(shouldStartPrint(null, '2026-09-22', false, 0)).toBe(false);
  });
});

describe('flattenForPrint / countByDoctor / printFontPt (가로 A4 한 장 시트)', () => {
  it('취소를 빼고 주치의 상관없이 예약시간 순 한 목록으로, 주치의 이름은 칸으로 붙인다', () => {
    const rows = flattenForPrint([
      res({ timeLabel: '11:00', patientName: '나', doctorName: '박소은' }),
      res({ timeLabel: '09:30', patientName: '다', doctorName: '김동규' }),
      res({ timeLabel: '09:30', patientName: '가', doctorName: '' }),
      res({ timeLabel: '10:00', patientName: '취소자', visitStatus: '취소' }),
    ]);
    expect(rows.map((r) => r.patientName)).toEqual(['가', '다', '나']);
    expect(rows.map((r) => r.printDoctor)).toEqual([UNASSIGNED_DOCTOR, '김동규', '박소은']);
  });

  it('주치의별 인원 요약은 이름순, 미지정은 맨 뒤', () => {
    const rows = flattenForPrint([res({ doctorName: '박소은' }), res({ doctorName: '김동규' }), res({ doctorName: '김동규' }), res({ doctorName: '' })]);
    expect(countByDoctor(rows)).toEqual([
      { doctorName: '김동규', count: 2 },
      { doctorName: '박소은', count: 1 },
      { doctorName: UNASSIGNED_DOCTOR, count: 1 },
    ]);
  });

  it('인원이 많을수록 글자가 작아지고 50명은 7pt', () => {
    expect(printFontPt(10)).toBe(11);
    expect(printFontPt(30)).toBe(10);
    expect(printFontPt(36)).toBe(9);
    expect(printFontPt(44)).toBe(8);
    expect(printFontPt(50)).toBe(7);
  });
});

describe('visitMarkerFor — 서버가 정한 판정(kind)을 우선한다', () => {
  it('kind 가 재진이면 표시 없음, 재초진이면 재초진, 초진(추정)이면 초진', () => {
    const row = res({ chartNo: '000002' });
    expect(visitMarkerFor(row, [cand({ kind: '재진', previousVisitDates: [] })], '2026-09-22')).toBeNull();
    expect(visitMarkerFor(row, [cand({ kind: '재초진' })], '2026-09-22')).toBe('재초진');
    expect(visitMarkerFor(row, [cand({ kind: '초진(추정)' })], '2026-09-22')).toBe('초진');
  });
});
