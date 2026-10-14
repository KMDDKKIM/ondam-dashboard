import { describe, expect, it } from 'vitest';
import { COURSE_GAP_DAYS, isFirstOfCourse, middleCallLead, orderDays, prescriptionCalls } from './herbCallSchedule';

describe('middleCallLead — 며칠분 끝나기 며칠 전에 중간상담', () => {
  it('원장 예시: 10일분→8일차, 15일분→12일차, 30일분→25일차', () => {
    expect(10 - middleCallLead(10)).toBe(8);
    expect(15 - middleCallLead(15)).toBe(12);
    expect(30 - middleCallLead(30)).toBe(25);
  });

  it('그 밖의 일수도 같은 비율(1/6, 최소 2일)', () => {
    expect(20 - middleCallLead(20)).toBe(17);
    expect(60 - middleCallLead(60)).toBe(50);
    expect(90 - middleCallLead(90)).toBe(75);
    expect(middleCallLead(5)).toBe(2);
    expect(middleCallLead(3)).toBe(2);
  });
});

describe('orderDays — 첩수가 아니라 며칠분', () => {
  it('며칠분이 있으면 그것(하루 2첩이어도 30첩이 아니라 15일분)', () => {
    expect(orderDays({ daysSupply: 15, packetCount: 30 })).toBe(15);
  });

  it('며칠분을 안 적었으면 첩수로, 둘 다 없으면 0', () => {
    expect(orderDays({ daysSupply: 0, packetCount: 15 })).toBe(15);
    expect(orderDays({ daysSupply: null, packetCount: 10 })).toBe(10);
    expect(orderDays({})).toBe(0);
  });
});

describe('prescriptionCalls', () => {
  it('첫 처방전: 수령예정일+2일 수령확인, 며칠분에 맞춘 중간상담', () => {
    expect(prescriptionCalls({ pickupDate: '2026-10-19', days: 15, firstOfCourse: true })).toEqual([
      { slot: 1, callDate: '2026-10-21', note: '한약 수령확인' },
      { slot: 2, callDate: '2026-10-31', note: '한약 중간상담 (15일분)' },
    ]);
  });

  it('금요일에 출력하고 월요일에 달여 수령예정일이 월요일이면 그날 기준이다(출력일 기준이 아니다)', () => {
    // 출력 2026-10-16(금), 수령예정일 2026-10-20(화) → 수령확인 10/22
    expect(prescriptionCalls({ pickupDate: '2026-10-20', days: 10, firstOfCourse: true })[0].callDate).toBe('2026-10-22');
  });

  it('재처방(첫 처방전이 아님)은 중간상담만', () => {
    const calls = prescriptionCalls({ pickupDate: '2026-11-03', days: 30, firstOfCourse: false });
    expect(calls).toEqual([{ slot: 2, callDate: '2026-11-28', note: '한약 중간상담 (30일분)' }]);
  });

  it('며칠분을 모르면 수령확인만(첫 처방전일 때)', () => {
    expect(prescriptionCalls({ pickupDate: '2026-10-19', days: 0, firstOfCourse: true })).toEqual([{ slot: 1, callDate: '2026-10-21', note: '한약 수령확인' }]);
    expect(prescriptionCalls({ pickupDate: '2026-10-19', days: 0, firstOfCourse: false })).toEqual([]);
  });

  it('아주 짧은 처방도 중간상담이 수령확인보다 늦다', () => {
    const [check, middle] = prescriptionCalls({ pickupDate: '2026-10-19', days: 3, firstOfCourse: true });
    expect(middle.callDate > check.callDate).toBe(true);
  });
});

describe('isFirstOfCourse', () => {
  it('이전 처방전이 없으면 첫 처방전', () => {
    expect(isFirstOfCourse('2026-10-19', [])).toBe(true);
  });

  it('이전 처방이 끝나기 전·끝난 뒤 30일 안에 이어지면 재처방', () => {
    const prior = [{ orderDate: '2026-10-01', days: 15 }];
    expect(isFirstOfCourse('2026-10-16', prior)).toBe(false);
    expect(isFirstOfCourse('2026-11-15', prior)).toBe(false); // 10/1 + 15 + 30 = 11/15
  });

  it('그보다 한참 뒤면 새 복용 과정', () => {
    expect(isFirstOfCourse('2026-11-16', [{ orderDate: '2026-10-01', days: 15 }])).toBe(true);
    expect(COURSE_GAP_DAYS).toBe(30);
  });

  it('이후 날짜의 처방전은 이전 처방으로 보지 않는다', () => {
    expect(isFirstOfCourse('2026-10-01', [{ orderDate: '2026-10-20', days: 15 }])).toBe(true);
  });
});
