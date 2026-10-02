import { describe, expect, it } from 'vitest';
import { buildDayEntries } from './homeCalendar';

describe('buildDayEntries', () => {
  it('이벤트가 없으면 빈 맵', () => {
    const map = buildDayEntries([], [], '2026-10-01', '2026-10-31');
    expect(map.size).toBe(0);
  });

  it('하루짜리 이벤트를 그 날짜에 담는다', () => {
    const map = buildDayEntries(
      [{ id: 'e1', eventDate: '2026-10-05', title: '정기 휴무' }],
      [],
      '2026-10-01',
      '2026-10-31'
    );
    expect(map.get('2026-10-05')?.events).toEqual([{ id: 'e1', title: '정기 휴무' }]);
  });

  it('범위 밖 이벤트는 빠진다', () => {
    const map = buildDayEntries(
      [{ id: 'e1', eventDate: '2026-11-05', title: '다음달 행사' }],
      [],
      '2026-10-01',
      '2026-10-31'
    );
    expect(map.has('2026-11-05')).toBe(false);
  });

  it('같은 날 여러 이벤트가 쌓인다', () => {
    const map = buildDayEntries(
      [
        { id: 'e1', eventDate: '2026-10-05', title: 'A' },
        { id: 'e2', eventDate: '2026-10-05', title: 'B' },
      ],
      [],
      '2026-10-01',
      '2026-10-31'
    );
    expect(map.get('2026-10-05')?.events).toHaveLength(2);
  });

  it('연차 기간을 날마다 펼쳐 담는다', () => {
    const map = buildDayEntries(
      [],
      [{ id: 'l1', staffName: '박소은', startDate: '2026-10-05', endDate: '2026-10-07', halfDay: null }],
      '2026-10-01',
      '2026-10-31'
    );
    expect(map.get('2026-10-05')?.leaves).toEqual([{ id: 'l1', staffName: '박소은', halfDay: null }]);
    expect(map.get('2026-10-06')?.leaves).toHaveLength(1);
    expect(map.get('2026-10-07')?.leaves).toHaveLength(1);
    expect(map.has('2026-10-08')).toBe(false);
  });

  it('반차는 halfDay가 그대로 담긴다', () => {
    const map = buildDayEntries(
      [],
      [{ id: 'l1', staffName: '이정민', startDate: '2026-10-05', endDate: '2026-10-05', halfDay: 'am' }],
      '2026-10-01',
      '2026-10-31'
    );
    expect(map.get('2026-10-05')?.leaves[0].halfDay).toBe('am');
  });

  it('범위를 넘는 연차 구간은 범위 안쪽만 담는다', () => {
    const map = buildDayEntries(
      [],
      [{ id: 'l1', staffName: '정지민', startDate: '2026-09-29', endDate: '2026-10-02', halfDay: null }],
      '2026-10-01',
      '2026-10-31'
    );
    expect(map.has('2026-09-29')).toBe(false);
    expect(map.get('2026-10-01')?.leaves).toHaveLength(1);
    expect(map.get('2026-10-02')?.leaves).toHaveLength(1);
  });

  it('같은 날 이벤트와 연차가 같이 담긴다', () => {
    const map = buildDayEntries(
      [{ id: 'e1', eventDate: '2026-10-05', title: '전직원 회의' }],
      [{ id: 'l1', staffName: '박소은', startDate: '2026-10-05', endDate: '2026-10-05', halfDay: null }],
      '2026-10-01',
      '2026-10-31'
    );
    const day = map.get('2026-10-05');
    expect(day?.events).toHaveLength(1);
    expect(day?.leaves).toHaveLength(1);
  });
});
