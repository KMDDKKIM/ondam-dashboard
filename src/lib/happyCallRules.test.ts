import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  dietSchedulePreview,
  normalizeRules,
  planTimedCalls,
  rulesEqual,
  specialCallDates,
  specialSingleCallDate,
  timingDate,
  timingText,
  type CallTiming,
  type TimedCallRules,
} from './happyCallRules';

const t = (p: Partial<CallTiming> = {}): CallTiming => ({ enabled: true, mode: 'after-pickup', days: 1, ...p });

describe('normalizeRules', () => {
  it('아무것도 없으면 기본 규칙', () => {
    expect(normalizeRules(undefined)).toEqual(DEFAULT_RULES);
    expect(normalizeRules(null)).toEqual(DEFAULT_RULES);
    expect(normalizeRules('엉뚱한 값')).toEqual(DEFAULT_RULES);
    expect(normalizeRules({})).toEqual(DEFAULT_RULES);
  });

  it('일부만 있으면 나머지는 기본값으로 채운다', () => {
    const r = normalizeRules({ herb: { pickupCheck: { days: 3 } } });
    expect(r.herb.pickupCheck).toEqual({ enabled: true, mode: 'after-pickup', days: 3 });
    expect(r.herb.middle).toEqual(DEFAULT_RULES.herb.middle);
    expect(r.diet).toEqual(DEFAULT_RULES.diet);
  });

  it('범위를 벗어난 값은 범위 안으로, 모르는 값은 기본값으로', () => {
    const r = normalizeRules({
      herb: { middle: { mode: '엉뚱', days: -5 }, revisit: { days: 9999 } },
      diet: { detoxCallDays: 10, pillDailyDays: -1, weeklyWeeks: 0, weeklyWeekday: '없는요일' },
    });
    expect(r.herb.middle.mode).toBe(DEFAULT_RULES.herb.middle.mode);
    expect(r.herb.middle.days).toBe(0);
    expect(r.herb.revisit.days).toBe(365);
    expect(r.diet.detoxCallDays).toBe(3);
    expect(r.diet.pillDailyDays).toBe(0);
    expect(r.diet.weeklyWeeks).toBe(1);
    expect(r.diet.weeklyWeekday).toBe('월');
  });

  it('숫자는 정수로 맞추고 빈 문자열·글자는 기본값', () => {
    const r = normalizeRules({ special: { middle: { days: '12.4' }, pickupCheck: { days: '' }, revisit: { days: '가' } } });
    expect(r.special.middle.days).toBe(12);
    expect(r.special.pickupCheck.days).toBe(DEFAULT_RULES.special.pickupCheck.days);
    expect(r.special.revisit.days).toBe(DEFAULT_RULES.special.revisit.days);
  });

  it('rulesEqual — 같은 규칙인지', () => {
    expect(rulesEqual(DEFAULT_RULES, normalizeRules({}))).toBe(true);
    expect(rulesEqual(DEFAULT_RULES, normalizeRules({ herb: { pickupCheck: { days: 2 } } }))).toBe(false);
  });
});

describe('timingDate', () => {
  it('수령일로부터 N일 뒤', () => {
    expect(timingDate(t({ days: 1 }), '2026-10-30', 15)).toBe('2026-10-31');
    expect(timingDate(t({ days: 0 }), '2026-10-30', 0)).toBe('2026-10-30');
    expect(timingDate(t({ days: 10 }), '2026-10-30', 0)).toBe('2026-11-09'); // 약 기간 몰라도 계산된다
  });

  it('약이 끝나기 N일 전 — 약 기간이 있어야 한다', () => {
    expect(timingDate(t({ mode: 'before-end', days: 5 }), '2026-10-01', 30)).toBe('2026-10-26');
    expect(timingDate(t({ mode: 'before-end', days: 5 }), '2026-10-01', 0)).toBeNull();
  });

  it('처방 기간에 맞춰 자동 — 10일분→8일차, 15일분→12일차, 30일분→25일차', () => {
    const auto = t({ mode: 'auto', days: 0 });
    expect(timingDate(auto, '2026-10-01', 10)).toBe('2026-10-09');
    expect(timingDate(auto, '2026-10-01', 15)).toBe('2026-10-13');
    expect(timingDate(auto, '2026-10-01', 30)).toBe('2026-10-26');
    expect(timingDate(auto, '2026-10-01', 0)).toBeNull();
  });

  it('꺼져 있으면 null', () => {
    expect(timingDate(t({ enabled: false }), '2026-10-01', 30)).toBeNull();
  });
});

describe('planTimedCalls', () => {
  const rules: TimedCallRules = {
    pickupCheck: t({ days: 1 }),
    middle: t({ mode: 'after-pickup', days: 10 }),
    revisit: t({ mode: 'before-end', days: 5 }),
  };

  it('수령확인·중간상담·내원 유도를 슬롯 1·2·3으로', () => {
    expect(planTimedCalls(rules, { pickupDate: '2026-09-01', supplyDays: 30 })).toEqual([
      { kind: 'pickupCheck', slot: 1, callDate: '2026-09-02' },
      { kind: 'middle', slot: 2, callDate: '2026-09-11' },
      { kind: 'revisit', slot: 3, callDate: '2026-09-26' },
    ]);
  });

  it('짧은 처방에서 순서가 뒤집히면 앞 해피콜 날짜로 맞춘다(간격 0)', () => {
    const calls = planTimedCalls(rules, { pickupDate: '2026-09-01', supplyDays: 2 });
    expect(calls.map((c) => c.callDate)).toEqual(['2026-09-02', '2026-09-11', '2026-09-11']);
  });

  it('최소 간격·바닥 날짜를 주면 하루씩 밀고 수령일 당일엔 걸지 않는다', () => {
    const calls = planTimedCalls(
      { pickupCheck: t({ days: 0 }), middle: t({ mode: 'auto', days: 0 }), revisit: t({ mode: 'before-end', days: 10 }) },
      { pickupDate: '2026-10-19', supplyDays: 3, minGap: 1, floor: '2026-10-20' }
    );
    expect(calls.map((c) => c.callDate)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });

  it('꺼진 것과 계산할 수 없는 것(약 기간 모름)은 뺀다', () => {
    const off = { ...rules, middle: t({ enabled: false }) };
    expect(planTimedCalls(off, { pickupDate: '2026-09-01', supplyDays: 30 }).map((c) => c.slot)).toEqual([1, 3]);
    expect(planTimedCalls(rules, { pickupDate: '2026-09-01', supplyDays: 0 }).map((c) => c.slot)).toEqual([1, 2]);
  });

  it('수령확인을 빼라고 하면(재처방) 뺀다', () => {
    expect(planTimedCalls(rules, { pickupDate: '2026-09-01', supplyDays: 30, includePickupCheck: false }).map((c) => c.slot)).toEqual([2, 3]);
  });
});

describe('specialCallDates / specialSingleCallDate — 특수한약·비급여 구매 기준 기본 규칙(수령확인 +1일, 중간 +10일, 종료 5일 전)', () => {
  const special = DEFAULT_RULES.special;

  it('15일분', () => {
    expect(specialCallDates(special, '2026-09-01', 15)).toEqual({ callDate1: '2026-09-02', callDate2: '2026-09-11', callDate3: '2026-09-11' });
  });

  it('30일분', () => {
    expect(specialCallDates(special, '2026-09-01', 30)).toEqual({ callDate1: '2026-09-02', callDate2: '2026-09-11', callDate3: '2026-09-26' });
  });

  it('아주 짧으면 3차가 2차보다 앞서지 않는다', () => {
    const r = specialCallDates(special, '2026-09-01', 2);
    expect(r.callDate3).toBe(r.callDate2);
  });

  it('꺼진 해피콜은 null', () => {
    const r = specialCallDates({ ...special, revisit: t({ enabled: false }) }, '2026-09-01', 30);
    expect(r.callDate3).toBeNull();
    expect(r.callDate1).toBe('2026-09-02');
  });

  it('처방일수가 없는 구매의 1회', () => {
    expect(specialSingleCallDate(special, '2026-09-01')).toBe('2026-09-02');
    expect(specialSingleCallDate({ ...special, withoutSupply: { enabled: true, days: 3 } }, '2026-09-01')).toBe('2026-09-04');
    expect(specialSingleCallDate({ ...special, withoutSupply: { enabled: false, days: 1 } }, '2026-09-01')).toBeNull();
  });
});

describe('timingText', () => {
  it('화면에 보여 줄 문구', () => {
    expect(timingText(t({ days: 1 }))).toBe('수령일 +1일');
    expect(timingText(t({ days: 0 }))).toBe('수령일 당일');
    expect(timingText(t({ mode: 'before-end', days: 5 }))).toBe('약이 끝나기 5일 전');
    expect(timingText(t({ mode: 'auto' }))).toBe('처방 기간에 맞춰 자동');
    expect(timingText(t({ enabled: false }))).toBe('안 함');
  });
});

describe('dietSchedulePreview', () => {
  it('기본 규칙: 디톡스 3일 직원, 환 시작부터 3일 매일, 그 뒤 월요일 4주', () => {
    // 디톡스 2026-11-02(월) → 환 시작 11-05(목)
    const p = dietSchedulePreview(DEFAULT_RULES.diet, '2026-11-02');
    expect(p.desk).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(p.pillStart).toBe('2026-11-05');
    expect(p.ownerDaily).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
    expect(p.weekly).toEqual(['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  });

  it('끄거나 줄이면 그만큼만', () => {
    const p = dietSchedulePreview({ ...DEFAULT_RULES.diet, detoxCallDays: 0, pillDailyDays: 0, weeklyEnabled: false }, '2026-11-02');
    expect(p.desk).toEqual([]);
    expect(p.ownerDaily).toEqual([]);
    expect(p.weekly).toEqual([]);
  });
});
