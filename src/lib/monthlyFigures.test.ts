import { describe, expect, it } from 'vitest';
import {
  achievementPercent,
  averageVisitsPerDay,
  computeMonthFigures,
  daysInMonth,
  elapsedDaysForMonth,
  goalPace,
  previousSameDayTotal,
  revenueMotivation,
  revenuePace,
  shortfallCount,
} from './monthlyFigures';

describe('averageVisitsPerDay', () => {
  it('내원 합계를 진료한 날 수로 나눈다(0명인 날·수 없는 날은 뺀다)', () => {
    const avg = averageVisitsPerDay([
      { totalRevenue: 1, visitCount: 16 },
      { totalRevenue: 1, visitCount: 38 },
      { totalRevenue: 0, visitCount: 0 },
      { totalRevenue: 1, visitCount: null },
    ]);
    expect(avg).toBe(27);
  });

  it('OK차트 월말결산 예시(520명/19일)와 같은 27.4가 나온다', () => {
    const visits = [16, 38, 21, 40, 23, 9, 39, 26, 38, 20, 36, 23, 11, 46, 27, 34, 23, 34, 16];
    expect(averageVisitsPerDay(visits.map((v) => ({ totalRevenue: 0, visitCount: v })))).toBe(27.4);
  });

  it('센 날이 하나도 없으면 null', () => {
    expect(averageVisitsPerDay([])).toBeNull();
    expect(averageVisitsPerDay([{ totalRevenue: 5, visitCount: null }])).toBeNull();
  });
});

describe('computeMonthFigures', () => {
  const daily = [
    { date: '2026-09-01', totalRevenue: 1000, visitCount: 10 },
    { date: '2026-09-02', totalRevenue: 2000, visitCount: 20 },
  ];

  it('월말결산이 없으면 일일결산을 누적한다(일평균은 진료한 날 기준, 객단가는 총진료비÷내원)', () => {
    expect(computeMonthFigures('2026-09', daily, null, 99)).toEqual({
      totalRevenue: 3000,
      avgDailyVisits: 15,
      totalVisits: 30,
      averageTicket: 100,
      dataThrough: '2026-09-02',
      legacyOverride: false,
    });
  });

  it('결산 데이터가 전혀 없으면 예약 명단 값으로, 그것도 없으면 null (객단가 없음)', () => {
    const empty = { totalRevenue: null, totalVisits: null, averageTicket: null, dataThrough: null, legacyOverride: false };
    expect(computeMonthFigures('2026-09', [], null, 12.3)).toEqual({ ...empty, avgDailyVisits: 12.3 });
    expect(computeMonthFigures('2026-09', [], null, null)).toEqual({ ...empty, avgDailyVisits: null });
  });

  it('다른 달 날짜의 일일결산은 무시한다', () => {
    const r = computeMonthFigures('2026-09', [...daily, { date: '2026-08-31', totalRevenue: 777, visitCount: 7 }], null, null);
    expect(r.totalRevenue).toBe(3000);
  });

  it('내원 수가 없는 옛 기록은 객단가에서 빠진다 / 내원이 0이면 객단가를 숨긴다', () => {
    const mixed = [
      { date: '2026-09-01', totalRevenue: 1000, visitCount: 10 },
      { date: '2026-09-02', totalRevenue: 5000, visitCount: null },
    ];
    expect(computeMonthFigures('2026-09', mixed, null, null)).toMatchObject({ totalRevenue: 6000, totalVisits: 10, averageTicket: 100 });
    const zero = [{ date: '2026-09-01', totalRevenue: 0, visitCount: 0 }];
    expect(computeMonthFigures('2026-09', zero, null, null)).toMatchObject({ totalVisits: 0, averageTicket: null });
    expect(computeMonthFigures('2026-09', [{ date: '2026-09-01', totalRevenue: 5, visitCount: null }], null, null)).toMatchObject({
      totalVisits: null,
      averageTicket: null,
    });
  });

  describe('월말결산 + 기준일(as_of_date)', () => {
    // 실제 9월 데이터: 월말결산 47,338,780원 · 일평균 27.4명(2026-09-19까지), 일일결산 9/19 1,610,250원·18명.
    const override = { totalRevenue: 47338780, avgDailyVisits: 27.4, asOfDate: '2026-09-19' };
    const sept19 = { date: '2026-09-19', totalRevenue: 1610250, visitCount: 18 };

    it('기준일 당일 일일결산은 월말결산에 이미 들어 있어 다시 더하지 않는다', () => {
      const r = computeMonthFigures('2026-09', [sept19], override, 99);
      expect(r.totalRevenue).toBe(47338780);
      expect(r.avgDailyVisits).toBe(27.4);
      expect(r.totalVisits).toBe(521); // 27.4 × 19일 = 520.6 → 521
      expect(r.averageTicket).toBe(90861); // 47,338,780 ÷ 521
      expect(r.dataThrough).toBe('2026-09-19');
      expect(r.legacyOverride).toBe(false);
    });

    it('기준일 이후 일일결산은 총매출·내원에 더하고, 일평균은 마지막 데이터 날짜까지의 경과일수로 나눈다', () => {
      const r = computeMonthFigures('2026-09', [sept19, { date: '2026-09-20', totalRevenue: 2000000, visitCount: 30 }], override, 99);
      expect(r.totalRevenue).toBe(49338780);
      expect(r.totalVisits).toBe(551);
      expect(r.avgDailyVisits).toBe(27.6); // 551 ÷ 20일
      expect(r.averageTicket).toBe(89544); // 49,338,780 ÷ 551
      expect(r.dataThrough).toBe('2026-09-20');
    });

    it('일일결산이 빠진 날이 있어도 마지막 데이터 날짜까지를 경과일수로 본다(달력 기준)', () => {
      const r = computeMonthFigures('2026-09', [{ date: '2026-09-22', totalRevenue: 1000000, visitCount: 20 }], override, null);
      expect(r.avgDailyVisits).toBe(24.6); // (521+20) ÷ 22
      expect(r.dataThrough).toBe('2026-09-22');
    });

    it('기준일 이전 날짜의 일일결산(예: 늦게 넣은 과거 마감)은 더하지 않는다', () => {
      const r = computeMonthFigures('2026-09', [{ date: '2026-09-10', totalRevenue: 999, visitCount: 5 }], override, null);
      expect(r.totalRevenue).toBe(47338780);
    });

    it('기준일 이후 내원 수가 빈(null) 날은 총매출에는 더하되 일평균 나눗셈 일수·내원·객단가에서는 뺀다', () => {
      const r = computeMonthFigures(
        '2026-09',
        [
          { date: '2026-09-20', totalRevenue: 2000000, visitCount: 30 },
          { date: '2026-09-21', totalRevenue: 1500000, visitCount: null },
        ],
        override,
        null
      );
      expect(r.totalRevenue).toBe(47338780 + 2000000 + 1500000);
      expect(r.totalVisits).toBe(551);
      expect(r.avgDailyVisits).toBe(27.6); // 551 ÷ 20일 (9/21은 나눗셈에 넣지 않음)
      expect(r.averageTicket).toBe(89544); // (47,338,780+2,000,000) ÷ 551 — null 날 매출 제외
      expect(r.dataThrough).toBe('2026-09-21');
      const onlyNull = computeMonthFigures('2026-09', [{ date: '2026-09-21', totalRevenue: 1500000, visitCount: null }], override, null);
      expect(onlyNull).toMatchObject({ totalRevenue: 48838780, avgDailyVisits: 27.4, totalVisits: 521, averageTicket: 90861 });
    });

    it('월말결산에 일평균이 없으면 총매출만 합산하고 내원/객단가는 모른다', () => {
      const r = computeMonthFigures(
        '2026-09',
        [{ date: '2026-09-20', totalRevenue: 1000, visitCount: 10 }],
        { totalRevenue: 5000, avgDailyVisits: null, asOfDate: '2026-09-19' },
        99
      );
      expect(r).toMatchObject({ totalRevenue: 6000, avgDailyVisits: 10, totalVisits: null, averageTicket: null });
    });

    it('기준일이 1일이거나 말일이어도 경과일수가 맞다', () => {
      const first = computeMonthFigures('2026-09', [], { totalRevenue: 100, avgDailyVisits: 10, asOfDate: '2026-09-01' }, null);
      expect(first).toMatchObject({ totalVisits: 10, avgDailyVisits: 10, dataThrough: '2026-09-01' });
      // 9월은 30일이지만 추석 휴진일(9/24~26) 3일을 빼면 진료일 27일 → 10명 × 27일 = 270명.
      const last = computeMonthFigures('2026-09', [], { totalRevenue: 3000, avgDailyVisits: 10, asOfDate: '2026-09-30' }, null);
      expect(last).toMatchObject({ totalVisits: 270, dataThrough: '2026-09-30' });
    });

    it('기준일이 그 달 밖이면 값이 깨지지 않는다(다음 달 날짜면 말일로, 이전 달이면 일일결산 전부를 더함)', () => {
      // 말일(9/30)로 클램프되므로 위 케이스와 같은 이유로 진료일 27일 기준 270명.
      const late = computeMonthFigures('2026-09', [sept19], { totalRevenue: 100, avgDailyVisits: 10, asOfDate: '2026-10-03' }, null);
      expect(late).toMatchObject({ totalRevenue: 100, totalVisits: 270, avgDailyVisits: 10, dataThrough: '2026-09-30' });
      const early = computeMonthFigures('2026-09', [sept19], { totalRevenue: 100, avgDailyVisits: 10, asOfDate: '2026-08-31' }, null);
      expect(early).toMatchObject({ totalRevenue: 1610350, totalVisits: 18, dataThrough: '2026-09-19' });
    });
  });

  describe('기준일 없는 옛 월말결산', () => {
    it('월말결산 값만 쓰고(일일결산은 더하지 않음) 경고 플래그를 켜며 객단가는 숨긴다', () => {
      const r = computeMonthFigures('2026-09', daily, { totalRevenue: 5000, avgDailyVisits: 27.4, asOfDate: null }, 99);
      expect(r).toEqual({
        totalRevenue: 5000,
        avgDailyVisits: 27.4,
        totalVisits: null,
        averageTicket: null,
        dataThrough: null,
        legacyOverride: true,
      });
    });

    it('일평균이 없으면 일일 누적 일평균을 쓴다', () => {
      expect(computeMonthFigures('2026-09', daily, { totalRevenue: 5000, avgDailyVisits: null, asOfDate: null }, 99).avgDailyVisits).toBe(15);
    });
  });
});

describe('achievementPercent', () => {
  it('달성/목표를 %로 반올림하고 목표 초과는 100을 넘겨 그대로 보여준다', () => {
    expect(achievementPercent(47338780, 60000000)).toBe(79);
    expect(achievementPercent(27.4, 25)).toBe(110);
  });

  it('목표가 없거나 0이거나 실적이 없으면 null', () => {
    expect(achievementPercent(10, null)).toBeNull();
    expect(achievementPercent(10, 0)).toBeNull();
    expect(achievementPercent(null, 10)).toBeNull();
  });
});

describe('revenuePace', () => {
  // 9월은 30일이지만 추석 휴진일(9/24~26) 3일을 빼면 진료일 27일. 9/19 기준이면 어제까지
  // (휴진 전) 18일 지났으니 진도는 18/27 ≈ 66.7%.
  const today = new Date(2026, 8, 19);

  it('목표 진도보다 늦으면 behind', () => {
    expect(revenuePace(30_000_000, 60_000_000, '2026-09', today)).toBe('behind');
  });

  it('진도에 맞거나 앞서면 onTrack, 진도의 95% 이상이면 여유로 본다', () => {
    expect(revenuePace(40_000_000, 60_000_000, '2026-09', today)).toBe('onTrack');
    expect(revenuePace(38_000_000, 60_000_000, '2026-09', today)).toBe('onTrack');
    expect(revenuePace(37_000_000, 60_000_000, '2026-09', today)).toBe('behind');
  });

  it('이번 달이 아니거나 목표·실적이 없거나 1일이면 null', () => {
    expect(revenuePace(1, 60_000_000, '2026-08', today)).toBeNull();
    expect(revenuePace(1, null, '2026-09', today)).toBeNull();
    expect(revenuePace(null, 60_000_000, '2026-09', today)).toBeNull();
    expect(revenuePace(0, 60_000_000, '2026-09', new Date(2026, 8, 1))).toBeNull();
  });
});

describe('goalPace / shortfallCount', () => {
  const today = new Date(2026, 8, 19); // 어제까지 18일 지났고 9월 진료일은 27일(추석 3일 제외) → 18/27

  it('건수 목표의 진도(expected)와 상태를 돌려준다', () => {
    expect(goalPace(3, 15, '2026-09', today)).toEqual({ status: 'behind', expected: 10 });
    expect(goalPace(10, 15, '2026-09', today)?.status).toBe('onTrack');
    expect(goalPace(3, 15, '2026-08', today)).toBeNull();
  });

  it('부족한 건수는 올림하고 최소 1건이다', () => {
    expect(shortfallCount(3, 9)).toBe(6);
    expect(shortfallCount(3, 3.4)).toBe(1);
    expect(shortfallCount(8, 8.2)).toBe(1);
  });
});

describe('daysInMonth', () => {
  it('28/29/30/31일을 맞게 센다(윤년 포함)', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-09')).toBe(30);
    expect(daysInMonth('2026-10')).toBe(31);
  });
});

describe('previousSameDayTotal', () => {
  const full = Array.from({ length: 31 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, totalRevenue: 100 }));

  it('지난달 1일~D일 일일결산이 빠짐없이 있으면 그 합계를 그대로 쓴다', () => {
    expect(previousSameDayTotal({ month: '2026-08', daily: full, totalRevenue: 3100 }, 20)).toEqual({ amount: 2000, approximate: false });
  });

  it('빠진 날이 있으면 지난달 총매출을 일할 계산한다', () => {
    const prev = { month: '2026-08', daily: [{ date: '2026-08-19', totalRevenue: 5 }], totalRevenue: 3100 };
    expect(previousSameDayTotal(prev, 20)).toEqual({ amount: 2000, approximate: true });
  });

  it('지난달이 더 짧아도(D > 지난달 일수) 지난달 전체를 쓴다', () => {
    const sept = { month: '2026-09', daily: [], totalRevenue: 3000 };
    expect(previousSameDayTotal(sept, 31)).toEqual({ amount: 3000, approximate: true });
  });

  it('오늘이 31일이고 지난달이 30일/2월이어도 지난달 전체 기준으로 비교한다', () => {
    const daily = (month: string, n: number) => Array.from({ length: n }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, '0')}`, totalRevenue: 100 }));
    // 지난달 30일 전부 있음 → D=31이어도 30일 합계(exact)
    expect(previousSameDayTotal({ month: '2026-09', daily: daily('2026-09', 30), totalRevenue: 3000 }, 31)).toEqual({ amount: 3000, approximate: false });
    // 2월(28일) 일부만 있음 → 2월 전체를 일할(28/28)로
    expect(previousSameDayTotal({ month: '2026-02', daily: daily('2026-02', 10), totalRevenue: 2800 }, 31)).toEqual({ amount: 2800, approximate: true });
    // 2월 28일 전부 있음 → exact
    expect(previousSameDayTotal({ month: '2026-02', daily: daily('2026-02', 28), totalRevenue: 2800 }, 31)).toEqual({ amount: 2800, approximate: false });
  });

  it('지난달 데이터가 없거나 D가 0이면 null', () => {
    expect(previousSameDayTotal({ month: '2026-08', daily: [], totalRevenue: null }, 20)).toBeNull();
    expect(previousSameDayTotal({ month: '2026-08', daily: full, totalRevenue: 3100 }, 0)).toBeNull();
  });
});

describe('elapsedDaysForMonth', () => {
  it('마지막 데이터 날짜까지, 없으면 어제까지 센다', () => {
    expect(elapsedDaysForMonth('2026-09-20', '2026-09-19')).toBe(19);
    expect(elapsedDaysForMonth('2026-09-20', '2026-09-20')).toBe(20);
    expect(elapsedDaysForMonth('2026-09-20', null)).toBe(19);
    expect(elapsedDaysForMonth('2026-09-01', null)).toBe(0);
  });
});

describe('revenueMotivation', () => {
  const base = { month: '2026-09', today: '2026-09-20', totalRevenue: 47338780, goal: 60000000, dataThrough: '2026-09-19', previous: null };

  it('9/20 실제 숫자: 남은 금액·필요 일평균 문구는 없고, 월말 예상 %만 숫자로 나온다', () => {
    // 9월 진료일 27일(추석 3일 제외) 기준: 47,338,780 ÷ 19일 × 27일 ÷ 60,000,000 ≈ 112%.
    const { reached, lines, projectedPercent, projectedPace } = revenueMotivation(base);
    expect(reached).toBe(false);
    expect(lines).toEqual([]);
    expect(projectedPercent).toBe(112);
    expect(projectedPace).toBe('onTrack');
  });

  it('오늘 마감까지 들어왔으면 오늘도 진행 일수에 넣어 월말 예상을 다시 잡는다', () => {
    const { projectedPercent } = revenueMotivation({ ...base, totalRevenue: 49338780, dataThrough: '2026-09-20' });
    expect(projectedPercent).toBe(111);
  });

  it('목표 달성이면 축하 문구만(월말 예상은 계산하지 않는다)', () => {
    const { reached, lines, projectedPercent } = revenueMotivation({ ...base, goal: 47000000 });
    expect(reached).toBe(true);
    expect(lines).toEqual(['🎉 목표 달성!']);
    expect(projectedPercent).toBeNull();
  });

  it('목표가 없거나 0이면 목표 관련 문구·예상이 없다', () => {
    expect(revenueMotivation({ ...base, goal: null })).toMatchObject({ lines: [], projectedPercent: null });
    expect(revenueMotivation({ ...base, goal: 0 })).toMatchObject({ lines: [], projectedPercent: null });
  });

  it('매출 데이터가 없으면 아무것도 보여주지 않는다', () => {
    expect(revenueMotivation({ ...base, totalRevenue: null, dataThrough: null }).lines).toEqual([]);
  });

  it('매월 1일(데이터 없음)에는 진행일수가 0이라 월말 예상을 계산하지 않는다', () => {
    const { lines, projectedPercent } = revenueMotivation({ ...base, today: '2026-09-01', totalRevenue: 0, dataThrough: null });
    expect(lines).toEqual([]);
    expect(projectedPercent).toBeNull();
  });

  it('말일: 오늘 마감 전/후로 진행 일수가 달라져 월말 예상도 달라진다', () => {
    const open = revenueMotivation({ ...base, today: '2026-09-30', totalRevenue: 58000000, dataThrough: '2026-09-29' });
    expect(open.projectedPercent).toBe(100);
    expect(open.projectedPace).toBe('onTrack');
    const closed = revenueMotivation({ ...base, today: '2026-09-30', totalRevenue: 58000000, dataThrough: '2026-09-30' });
    expect(closed.projectedPercent).toBe(97);
    expect(closed.projectedPace).toBe('behind');
  });

  it('지난 달을 볼 때는 달성 여부만 본다', () => {
    expect(revenueMotivation({ ...base, month: '2026-08', totalRevenue: 10, goal: 100 }).lines).toEqual([]);
    expect(revenueMotivation({ ...base, month: '2026-08', totalRevenue: 200, goal: 100 }).lines).toEqual(['🎉 목표 달성!']);
  });

  it('지난달 같은 날 대비(정확/일할 추정) 문구', () => {
    const daily = Array.from({ length: 31 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, totalRevenue: 2000000 }));
    const exact = revenueMotivation({ ...base, goal: null, previous: { month: '2026-08', daily, totalRevenue: 62000000 } });
    // 지난달 1~19일 = 38,000,000 → 47,338,780은 +25%
    expect(exact.lines).toEqual(['지난달 같은 날 대비 +25%']);
    const approx = revenueMotivation({ ...base, goal: null, previous: { month: '2026-08', daily: [], totalRevenue: 62000000 } });
    expect(approx.lines).toEqual(['지난달 같은 날(일할 추정) 대비 +25%']);
    const down = revenueMotivation({ ...base, goal: null, previous: { month: '2026-08', daily: [], totalRevenue: 124000000 } });
    expect(down.lines).toEqual(['지난달 같은 날(일할 추정) 대비 -38%']);
  });

  it('지난달 데이터가 없거나 0원이면 비교 문구를 내지 않는다', () => {
    expect(revenueMotivation({ ...base, goal: null, previous: { month: '2026-08', daily: [], totalRevenue: null } }).lines).toEqual([]);
    expect(revenueMotivation({ ...base, goal: null, previous: { month: '2026-08', daily: [], totalRevenue: 0 } }).lines).toEqual([]);
  });

  it('목표 달성 시에도 지난달 비교는 함께 보여준다', () => {
    const { lines } = revenueMotivation({ ...base, goal: 1000, previous: { month: '2026-08', daily: [], totalRevenue: 62000000 } });
    expect(lines[0]).toBe('🎉 목표 달성!');
    expect(lines[1]).toContain('지난달 같은 날');
  });
});
