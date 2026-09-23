import { describe, expect, it } from 'vitest';
import { normalizeTimeLabel, sortReservationsByTime } from './timeLabel';

describe('normalizeTimeLabel', () => {
  it('콜론이 있으면 그대로 시:분으로 본다', () => {
    expect(normalizeTimeLabel('9:30')).toBe('09:30');
    expect(normalizeTimeLabel('14:5')).toBe('14:05');
    expect(normalizeTimeLabel('09:30')).toBe('09:30');
  });
  it('점(.)도 구분자로 받는다', () => {
    expect(normalizeTimeLabel('14.30')).toBe('14:30');
  });
  it('숫자만 있으면 자리수로 시/분을 나눈다', () => {
    expect(normalizeTimeLabel('930')).toBe('09:30');
    expect(normalizeTimeLabel('1430')).toBe('14:30');
    expect(normalizeTimeLabel('130')).toBe('01:30');
  });
  it('1~2자리 숫자는 시로 보고 분은 00으로 채운다', () => {
    expect(normalizeTimeLabel('9')).toBe('09:00');
    expect(normalizeTimeLabel('14')).toBe('14:00');
  });
  it('빈 값은 그대로 둔다', () => {
    expect(normalizeTimeLabel('')).toBe('');
    expect(normalizeTimeLabel('   ')).toBe('');
  });
  it('숫자를 하나도 못 읽으면 원문을 그대로 둔다', () => {
    expect(normalizeTimeLabel('오전')).toBe('오전');
  });
  it('범위를 벗어나면 0~23시, 0~59분으로 잘라낸다', () => {
    expect(normalizeTimeLabel('9999')).toBe('23:59');
  });
});

describe('sortReservationsByTime', () => {
  function row(timeLabel: string, patientName = '') {
    return { timeLabel, patientName };
  }

  it('예약시간 순으로 정렬한다', () => {
    const rows = [row('14:00', 'b'), row('09:30', 'a'), row('10:00', 'c')];
    expect(sortReservationsByTime(rows).map((r) => r.patientName)).toEqual(['a', 'c', 'b']);
  });
  it('시간이 없는 줄은 맨 뒤로 보낸다', () => {
    const rows = [row('', 'no-time'), row('09:00', 'a')];
    expect(sortReservationsByTime(rows).map((r) => r.patientName)).toEqual(['a', 'no-time']);
  });
  it('안정 정렬 — 같은 시간이면 원래 순서를 유지한다', () => {
    const rows = [row('09:00', 'first'), row('09:00', 'second')];
    expect(sortReservationsByTime(rows).map((r) => r.patientName)).toEqual(['first', 'second']);
  });
  it('원본 배열을 바꾸지 않는다', () => {
    const rows = [row('14:00'), row('09:00')];
    sortReservationsByTime(rows);
    expect(rows.map((r) => r.timeLabel)).toEqual(['14:00', '09:00']);
  });
});
