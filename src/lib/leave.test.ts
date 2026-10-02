import { describe, expect, it } from 'vitest';
import { computeBalances, computePolicyEntitlement, leaveDaysUsed, monthGridWeeks, monthsBetween, summarizeBalance } from './leave';

describe('monthsBetween', () => {
  it('꽉 찬 달만 센다', () => {
    expect(monthsBetween('2026-01-15', '2026-04-15')).toBe(3);
    expect(monthsBetween('2026-01-15', '2026-04-14')).toBe(2); // 아직 하루 모자람
    expect(monthsBetween('2026-01-15', '2026-04-16')).toBe(3);
  });

  it('입사일과 오늘이 같으면 0', () => {
    expect(monthsBetween('2026-01-15', '2026-01-15')).toBe(0);
  });

  it('해가 바뀌어도 계산된다', () => {
    expect(monthsBetween('2025-11-01', '2026-02-01')).toBe(3);
  });

  it('음수가 되면 0으로 고정', () => {
    expect(monthsBetween('2026-05-01', '2026-01-01')).toBe(0);
  });
});

describe('computePolicyEntitlement', () => {
  it('입사일이 없으면 0, 0', () => {
    expect(computePolicyEntitlement(null, '2026-06-01')).toEqual({ monthly: 0, annual: 0 });
  });

  it('수습기간(3개월 미만)엔 월차·연차 모두 0', () => {
    expect(computePolicyEntitlement('2026-01-01', '2026-03-31')).toEqual({ monthly: 0, annual: 0 });
  });

  it('수습 3개월이 끝나는 날 월차 1일 생긴다', () => {
    expect(computePolicyEntitlement('2026-01-01', '2026-04-01')).toEqual({ monthly: 1, annual: 0 });
  });

  it('수습 끝난 뒤 한 달마다 월차가 하나씩 늘어난다', () => {
    expect(computePolicyEntitlement('2026-01-01', '2026-05-01')).toEqual({ monthly: 2, annual: 0 });
    expect(computePolicyEntitlement('2026-01-01', '2026-06-01')).toEqual({ monthly: 3, annual: 0 });
  });

  it('입사 1년이 되는 날 법정연차(15일)로 바뀌고 월차는 더 안 늘어난다', () => {
    expect(computePolicyEntitlement('2026-01-01', '2027-01-01')).toEqual({ monthly: 9, annual: 15 });
  });

  it('1년이 한참 지나도 그대로', () => {
    expect(computePolicyEntitlement('2020-01-01', '2026-06-01')).toEqual({ monthly: 9, annual: 15 });
  });
});

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
  it('월차·연차를 종류별로 따로 계산한다(수습 끝~1년 사이)', () => {
    const balances = computeBalances(
      '2026-01-01',
      '2026-06-01', // 5개월째 — 월차 3일
      [{ kind: 'monthly', days: 1 }],
      [{ kind: 'monthly', days: 2 }]
    );
    expect(balances.monthly).toEqual({ entitled: 4, used: 2, available: 2 });
    expect(balances.annual).toEqual({ entitled: 0, used: 0, available: 0 });
  });

  it('1년 지나면 연차 쪽만 움직인다', () => {
    const balances = computeBalances(
      '2025-01-01',
      '2026-06-01',
      [{ kind: 'annual', days: -2 }],
      [{ kind: 'annual', days: 5 }, { kind: 'monthly', days: 1 }]
    );
    expect(balances.annual).toEqual({ entitled: 13, used: 5, available: 8 });
    expect(balances.monthly).toEqual({ entitled: 9, used: 1, available: 8 });
  });

  it('입사일이 없으면 둘 다 0에서 시작', () => {
    const balances = computeBalances(null, '2026-06-01', [], []);
    expect(balances.monthly.entitled).toBe(0);
    expect(balances.annual.entitled).toBe(0);
  });
});
