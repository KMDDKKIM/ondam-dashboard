import { describe, expect, it } from 'vitest';
import { computeBalances, defaultLeaveKind, grantedKinds, leaveDaysUsed, monthGridWeeks, summarizeBalance, yearOfDate } from './leave';

describe('yearOfDate', () => {
  it('날짜 문자열에서 연도만 뽑는다', () => {
    expect(yearOfDate('2026-01-15')).toBe(2026);
    expect(yearOfDate('2027-12-31')).toBe(2027);
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
  it('월차·연차를 종류별로 따로 계산한다(부여=조정 합계)', () => {
    const balances = computeBalances(
      2026,
      [{ kind: 'monthly', days: 1, year: 2026 }, { kind: 'monthly', days: 1, year: 2026 }],
      [{ kind: 'monthly', days: 1, year: 2026 }]
    );
    expect(balances.monthly).toEqual({ entitled: 2, used: 1, available: 1 });
    expect(balances.annual).toEqual({ entitled: 0, used: 0, available: 0 });
  });

  it('연차 부여·사용은 월차와 섞이지 않는다', () => {
    const balances = computeBalances(
      2026,
      [{ kind: 'annual', days: 15, year: 2026 }, { kind: 'monthly', days: 3, year: 2026 }],
      [{ kind: 'annual', days: 5, year: 2026 }, { kind: 'monthly', days: 1, year: 2026 }]
    );
    expect(balances.annual).toEqual({ entitled: 15, used: 5, available: 10 });
    expect(balances.monthly).toEqual({ entitled: 3, used: 1, available: 2 });
  });

  it('부여·사용 둘 다 없으면 0', () => {
    const balances = computeBalances(2026, [], []);
    expect(balances.monthly).toEqual({ entitled: 0, used: 0, available: 0 });
    expect(balances.annual).toEqual({ entitled: 0, used: 0, available: 0 });
  });

  it('연차는 해가 지나면 전년도 미사용분이 소멸된다(이월 없음)', () => {
    // 2026년에 15일 부여, 3일만 사용 → 2026년 기준 12일 남지만, 2027년 조회에는 안 잡힌다.
    const balances2027 = computeBalances(
      2027,
      [{ kind: 'annual', days: 15, year: 2026 }, { kind: 'annual', days: 10, year: 2027 }],
      [{ kind: 'annual', days: 3, year: 2026 }]
    );
    expect(balances2027.annual).toEqual({ entitled: 10, used: 0, available: 10 });
  });

  it('월차는 연도와 무관하게 전부 누적된다', () => {
    const balances = computeBalances(
      2027,
      [{ kind: 'monthly', days: 1, year: 2026 }, { kind: 'monthly', days: 1, year: 2027 }],
      [{ kind: 'monthly', days: 1, year: 2026 }]
    );
    expect(balances.monthly).toEqual({ entitled: 2, used: 1, available: 1 });
  });
});

describe('grantedKinds / defaultLeaveKind', () => {
  const b = (monthly: number, annual: number, usedAnnual = 0) =>
    computeBalances(
      2026,
      [
        ...(monthly ? [{ kind: 'monthly' as const, days: monthly, year: 2026 }] : []),
        ...(annual ? [{ kind: 'annual' as const, days: annual, year: 2026 }] : []),
      ],
      usedAnnual ? [{ kind: 'annual', days: usedAnnual, year: 2026 }] : []
    );

  it('부여된 종류만 월차→연차 순으로', () => {
    expect(grantedKinds(b(2, 15))).toEqual(['monthly', 'annual']);
    expect(grantedKinds(b(0, 15))).toEqual(['annual']);
    expect(grantedKinds(b(3, 0))).toEqual(['monthly']);
  });

  it('아무것도 부여 안 됐으면 빈 목록', () => {
    expect(grantedKinds(b(0, 0))).toEqual([]);
  });

  it('다 써서 남은 게 0이어도 부여된 종류로는 남는다', () => {
    expect(grantedKinds(b(0, 15, 15))).toEqual(['annual']);
  });

  it('기본 선택은 남은 일수가 있는 종류를 우선한다', () => {
    expect(defaultLeaveKind(['monthly', 'annual'], b(2, 15))).toBe('monthly');
    expect(defaultLeaveKind(['monthly', 'annual'], b(0, 15))).toBe('annual');
  });

  it('둘 다 남은 게 없으면 부여된 첫 종류, 부여된 게 없으면 null', () => {
    expect(defaultLeaveKind(['annual'], b(0, 15, 15))).toBe('annual');
    expect(defaultLeaveKind([], b(0, 0))).toBeNull();
  });
});
