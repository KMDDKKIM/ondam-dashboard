import { describe, expect, it } from 'vitest';
import { matchReminders, reminderDetail } from './dietReminders';

// 환자 이름·차트번호는 시험용 값이다(공개 저장소).
describe('matchReminders — 내일 예약과 린다이어트 프로그램', () => {
  const programs = [
    { id: 'p1', patientName: '가나다', chartNo: '003637' },
    { id: 'p2', patientName: '라마바', chartNo: '' },
  ];

  it('차트번호가 같으면(앞의 0이 달라도) 이름이 달라도 같은 환자', () => {
    const r = matchReminders(programs, [{ patientName: '가나다', chartNo: '3637', timeLabel: '14:30' }]);
    expect(r).toEqual([{ programId: 'p1', timeLabel: '14:30' }]);
  });

  it('이름이 같아도 차트번호가 다르면 동명이인이라 맞추지 않는다', () => {
    expect(matchReminders(programs, [{ patientName: '가나다', chartNo: '999999', timeLabel: '14:30' }])).toEqual([]);
  });

  it('차트번호가 한쪽에 없으면 이름으로 맞춘다', () => {
    expect(matchReminders(programs, [{ patientName: '라마바', chartNo: '123456', timeLabel: '10:00' }])).toEqual([{ programId: 'p2', timeLabel: '10:00' }]);
    expect(matchReminders(programs, [{ patientName: '가나다', chartNo: '', timeLabel: '10:00' }])).toEqual([{ programId: 'p1', timeLabel: '10:00' }]);
  });

  it('한 환자에게 예약이 여러 개면 가장 이른 시간 하나만', () => {
    const r = matchReminders(programs, [
      { patientName: '가나다', chartNo: '003637', timeLabel: '16:00' },
      { patientName: '가나다', chartNo: '003637', timeLabel: '09:30' },
    ]);
    expect(r).toEqual([{ programId: 'p1', timeLabel: '09:30' }]);
  });

  it('예약이 없으면 빈 목록', () => {
    expect(matchReminders(programs, [])).toEqual([]);
  });
});

describe('reminderDetail', () => {
  it('날짜와 시간', () => {
    expect(reminderDetail('2026-10-23', '14:30')).toBe('10/23 14:30');
    expect(reminderDetail('2026-10-23', '')).toBe('10/23');
  });
});
