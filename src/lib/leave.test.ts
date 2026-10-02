import { describe, expect, it } from 'vitest';
import { computeBalances, leaveDaysUsed, monthGridWeeks, summarizeBalance } from './leave';

describe('leaveDaysUsed', () => {
  it('하루 연차', () => {
    expect(leaveDaysUsed('2026-06-01', '2026-06-01', null)).toBe(1);
  });

  it('여러 날 연차(포함 양끝)', () => {
    expect(leaveDaysUsed('2026-06-01', '2026-06-05', null)).toBe(5);
  });

  it('반차는 0.5일(기간과 무관)', () => {
    expect(leaveDaysUsed('2026-06-01', '2026-06-01', 'am')).toBe(0.5);
    expect(leaveDaysUsed('2026-06-01', '2026-06-01', 'pm')).toBe(0.5);
  });

  it('구간에 추석·설 휴진일이 끼면 그만큼 뺀다', () => {
    // 2026-09-24~26이 추석 휴진일(CLINIC_HOLIDAYS)
    expect(leaveDaysUsed('2026-09-23', '2026-09-27', null)).toBe(2); // 5일 중 3일은 원래 휴진이라 제외
  });
});

describe('monthGridWeeks', () => {
  it('항상 일요일에 시작하고, 7일씩 꽉 찬 주로 나눈다', () => {
    const weeks = monthGridWeeks('2026-06');
    for (const week of weeks) {
      expect(week).toHaveLength(7);
    }
    expect(weeks[0][0]).toBe('2026-05-31'); // 6월 1일(월)이라 앞주는 전달 마지막 일요일부터
  });

  it('앞뒤로 이전/다음 달 날짜를 채운다', () => {
    const weeks = monthGridWeeks('2026-06'); // 6/1=월요일, 6/30=화요일
    expect(weeks[0]).toEqual([
      '2026-05-31',
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
    ]);
    const lastWeek = weeks[weeks.length - 1];
    expect(lastWeek).toEqual([
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
    ]);
  });

  it('1일이 일요일이면 앞에 채울 날이 없다', () => {
    const weeks = monthGridWeeks('2026-11'); // 11/1=일요일
    expect(weeks[0][0]).toBe('2026-11-01');
  });

  it('마지막 날이 토요일이면 뒤에 채울 날이 없다(딱 맞는 주 수)', () => {
    const weeks = monthGridWeeks('2026-02'); // 2/1=일, 2/28=토
    expect(weeks).toHaveLength(4);
    expect(weeks[weeks.length - 1][6]).toBe('2026-02-28');
  });
});

describe('summarizeBalance', () => {
  it('부여 + 조정 - 사용 = 남음', () => {
    expect(summarizeBalance(9, [2, -1], [3, 1])).toEqual({ entitled: 10, used: 4, available: 6 });
  });

  it('조정·사용 둘 다 없으면 부여만큼 그대로 남는다', () => {
    expect(summarizeBalance(5, [], [])).toEqual({ entitled: 5, used: 0, available: 5 });
  });
});

describe('computeBalances', () => {
  it('월차·연차를 종류별로 따로 계산한다(부여=조정 합계)', () => {
    const balances = computeBalances(
      [{ kind: 'monthly', days: 1 }, { kind: 'monthly', days: 1 }],
      [{ kind: 'monthly', days: 1 }]
    );
    expect(balances.monthly).toEqual({ entitled: 2, used: 1, available: 1 });
    expect(balances.annual).toEqual({ entitled: 0, used: 0, available: 0 });
  });

  it('연차 부여·사용은 월차와 섞이지 않는다', () => {
    const balances = computeBalances(
      [{ kind: 'annual', days: 15 }, { kind: 'monthly', days: 3 }],
      [{ kind: 'annual', days: 5 }, { kind: 'monthly', days: 1 }]
    );
    expect(balances.annual).toEqual({ entitled: 15, used: 5, available: 10 });
    expect(balances.monthly).toEqual({ entitled: 3, used: 1, available: 2 });
  });

  it('부여·사용 둘 다 없으면 0', () => {
    const balances = computeBalances([], []);
    expect(balances.monthly).toEqual({ entitled: 0, used: 0, available: 0 });
    expect(balances.annual).toEqual({ entitled: 0, used: 0, available: 0 });
  });
});
