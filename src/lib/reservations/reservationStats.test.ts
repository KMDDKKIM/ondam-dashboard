import { describe, expect, it } from 'vitest';
import { computeDerivedStats } from './reservationStats';
import type { Reservation } from './types';

function row(overrides: Partial<Reservation>): Reservation {
  return {
    doctorName: '김동규',
    timeLabel: '10:00',
    patientName: '환자',
    chartNo: '000001',
    phone: '',
    mobile: '',
    visitStatus: '내원',
    treatmentArea: '통원',
    treatment: '침부항',
    specialNotes: '',
    memo: '',
    ...overrides,
  };
}

describe('computeDerivedStats', () => {
  it('counts visited vs cancelled rows separately', () => {
    const rows = [
      row({ patientName: 'A', visitStatus: '내원' }),
      row({ patientName: 'B', visitStatus: '취소' }),
      row({ patientName: 'C', visitStatus: '내원' }),
    ];
    const stats = computeDerivedStats(rows);
    expect(stats.reservationCount).toBe(3);
    expect(stats.visitCount).toBe(2);
    expect(stats.excludedCount).toBe(1);
    expect(stats.excludedNames).toEqual(['B']);
  });

  it('flags rows whose treatment area or treatment mentions 추나', () => {
    const rows = [
      row({ patientName: 'A', treatmentArea: '통원', treatment: 'U+비급여 추나' }),
      row({ patientName: 'B', treatmentArea: '추나', treatment: '봉침' }),
      row({ patientName: 'C', treatmentArea: '통원', treatment: '침부항' }),
    ];
    const stats = computeDerivedStats(rows);
    expect(stats.chunaCount).toBe(2);
    expect(stats.chunaNames).toEqual(['A', 'B']);
  });

  it('returns all zeros for an empty list', () => {
    const stats = computeDerivedStats([]);
    expect(stats).toEqual({
      visitCount: 0,
      reservationCount: 0,
      excludedCount: 0,
      excludedNames: [],
      chunaCount: 0,
      chunaNames: [],
    });
  });
});
