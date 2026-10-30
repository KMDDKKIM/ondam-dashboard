// 해피콜을 언제 걸지 정하는 규칙(원장이 비급여 현황 > 해피콜 규칙에서 바꾼다) — 원장 요청 2026-10-30.
// 순수 로직만 있다. 규칙의 저장·불러오기·이미 만든 해피콜에 다시 적용하는 일은 supabase/happyCallRules.ts.
//
// 규칙은 세 묶음이다.
//  - herb: 일반 한약(처방전 기준) — 수령예정일을 정하면 수령확인·중간상담·내원 유도 해피콜이 만들어진다(lib/herbCallSchedule.ts).
//  - special: 특수한약(공진단·경옥고 등)과 그 밖의 비급여 구매 — 구매의 수령일·처방일수로 만든다(lib/nonCoveredCalls.ts).
//  - diet: 린다이어트 — 디톡스 기간은 직원 해피콜 목록, 다이어트환을 시작한 뒤는 원장 케어 보드(lib/dietProgram.ts).

import { addDaysKst, weekdayKo } from './kst';

/** 날짜를 어디서부터 세는가: 수령일로부터 N일 뒤 / 약이 끝나기 N일 전 / 처방 기간에 맞춰 자동 */
export type TimingMode = 'after-pickup' | 'before-end' | 'auto';

export const TIMING_MODES: readonly TimingMode[] = ['after-pickup', 'before-end', 'auto'];

export interface CallTiming {
  enabled: boolean;
  mode: TimingMode;
  /** after-pickup: 수령일 + days / before-end: 약 소진일 − days (auto 에서는 쓰지 않는다) */
  days: number;
}

/** 수령일 기준 해피콜 세 개 — 순서대로 slot 1·2·3. */
export interface TimedCallRules {
  pickupCheck: CallTiming;
  middle: CallTiming;
  /** 약이 떨어지기 전에 연락해 다음 처방·내원을 잡는 해피콜(내원 유도, 연복 권유) */
  revisit: CallTiming;
}

export interface SpecialRules extends TimedCallRules {
  /** 처방일수 없이 수령일만 있는 구매의 해피콜 1회: 수령일 + days */
  withoutSupply: { enabled: boolean; days: number };
}

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface DietRules {
  /** 디톡스 시작일부터 며칠 동안 매일 직원이 해피콜하는가(0 = 안 함, 최대 3) */
  detoxCallDays: number;
  /** 다이어트환 시작일부터 며칠 동안 매일 원장이 카톡하는가(0 = 안 함) */
  pillDailyDays: number;
  /** 그 뒤 매주 한 번 문안을 보내는가 */
  weeklyEnabled: boolean;
  weeklyWeeks: number;
  weeklyWeekday: Weekday;
}

export interface HappyCallRules {
  herb: TimedCallRules;
  special: SpecialRules;
  diet: DietRules;
}

export const MAX_DETOX_CALL_DAYS = 3;
export const MAX_PILL_DAILY_DAYS = 14;
export const MAX_WEEKLY_WEEKS = 52;
const MAX_TIMING_DAYS = 365;

/** 지금까지 쓰던 방식 그대로(원장 결정 2026-10-14·21, 직원 요청 2026-10-30으로 수령확인만 수령일 +1일). */
export const DEFAULT_RULES: HappyCallRules = {
  herb: {
    pickupCheck: { enabled: true, mode: 'after-pickup', days: 1 },
    middle: { enabled: true, mode: 'auto', days: 0 },
    revisit: { enabled: false, mode: 'before-end', days: 5 },
  },
  special: {
    pickupCheck: { enabled: true, mode: 'after-pickup', days: 1 },
    middle: { enabled: true, mode: 'after-pickup', days: 10 },
    revisit: { enabled: true, mode: 'before-end', days: 5 },
    withoutSupply: { enabled: true, days: 1 },
  },
  diet: { detoxCallDays: 3, pillDailyDays: 3, weeklyEnabled: true, weeklyWeeks: 4, weeklyWeekday: '월' },
};

// ---- 검증 ----

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (v === '' || v == null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function timing(raw: unknown, fallback: CallTiming): CallTiming {
  const o = obj(raw);
  const mode = TIMING_MODES.includes(o.mode as TimingMode) ? (o.mode as TimingMode) : fallback.mode;
  return { enabled: bool(o.enabled, fallback.enabled), mode, days: int(o.days, fallback.days, 0, MAX_TIMING_DAYS) };
}

/** 저장된(또는 화면에서 만든) 값을 규칙으로 정리한다. 빠진 값은 기본값으로 채우고 범위를 벗어난 값은 범위 안으로 맞춘다. */
export function normalizeRules(raw: unknown): HappyCallRules {
  const o = obj(raw);
  const herb = obj(o.herb);
  const special = obj(o.special);
  const diet = obj(o.diet);
  const d = DEFAULT_RULES;
  const without = obj(special.withoutSupply);
  return {
    herb: {
      pickupCheck: timing(herb.pickupCheck, d.herb.pickupCheck),
      middle: timing(herb.middle, d.herb.middle),
      revisit: timing(herb.revisit, d.herb.revisit),
    },
    special: {
      pickupCheck: timing(special.pickupCheck, d.special.pickupCheck),
      middle: timing(special.middle, d.special.middle),
      revisit: timing(special.revisit, d.special.revisit),
      withoutSupply: { enabled: bool(without.enabled, d.special.withoutSupply.enabled), days: int(without.days, d.special.withoutSupply.days, 0, MAX_TIMING_DAYS) },
    },
    diet: {
      detoxCallDays: int(diet.detoxCallDays, d.diet.detoxCallDays, 0, MAX_DETOX_CALL_DAYS),
      pillDailyDays: int(diet.pillDailyDays, d.diet.pillDailyDays, 0, MAX_PILL_DAILY_DAYS),
      weeklyEnabled: bool(diet.weeklyEnabled, d.diet.weeklyEnabled),
      weeklyWeeks: int(diet.weeklyWeeks, d.diet.weeklyWeeks, 1, MAX_WEEKLY_WEEKS),
      weeklyWeekday: WEEKDAYS.includes(diet.weeklyWeekday as Weekday) ? (diet.weeklyWeekday as Weekday) : d.diet.weeklyWeekday,
    },
  };
}

export function rulesEqual(a: HappyCallRules, b: HappyCallRules): boolean {
  return JSON.stringify(normalizeRules(a)) === JSON.stringify(normalizeRules(b));
}

// ---- 날짜 계산 ----

/**
 * 중간상담을 약이 끝나기 며칠 전에 거는지(처방 기간에 맞춰 자동). 10일분→8일차, 15일분→12일차, 30일분→25일차(원장 예시)에 맞춰
 * 일수의 1/6(반올림)이고 최소 2일이다. 20일분은 17일차, 60일분은 50일차, 90일분은 75일차.
 */
export function middleCallLead(supplyDays: number): number {
  return Math.max(2, Math.round(supplyDays / 6));
}

/** 이 규칙으로 정해지는 날짜. 꺼져 있거나, 약 기간을 모르는데 기간이 필요한 방식이면 null. */
export function timingDate(t: CallTiming, pickupDate: string, supplyDays: number): string | null {
  if (!t.enabled) return null;
  if (t.mode === 'after-pickup') return addDaysKst(pickupDate, t.days);
  if (!(supplyDays > 0)) return null;
  if (t.mode === 'before-end') return addDaysKst(pickupDate, supplyDays - t.days);
  return addDaysKst(pickupDate, supplyDays - middleCallLead(supplyDays));
}

export type TimedCallKind = 'pickupCheck' | 'middle' | 'revisit';

export const TIMED_CALL_SLOT: Record<TimedCallKind, 1 | 2 | 3> = { pickupCheck: 1, middle: 2, revisit: 3 };

export const TIMED_CALL_LABEL: Record<TimedCallKind, string> = { pickupCheck: '수령확인', middle: '중간상담', revisit: '내원 유도(연복 권유)' };

export interface PlannedCall {
  kind: TimedCallKind;
  slot: 1 | 2 | 3;
  callDate: string;
}

export interface PlanOptions {
  pickupDate: string;
  /** 며칠분인지(모르면 0) */
  supplyDays: number;
  /** 수령확인을 거는가(재처방은 첫 처방전에서만 건다) */
  includePickupCheck?: boolean;
  /** 앞 해피콜과 최소 며칠 띄우는가. 순서가 뒤집히면(짧은 처방 등) 뒤 해피콜을 이만큼 뒤로 민다. */
  minGap?: number;
  /** 어떤 해피콜도 이 날짜보다 앞서지 않는다 */
  floor?: string;
}

/** 수령일 기준 해피콜(수령확인·중간상담·내원 유도)의 날짜. 꺼진 것·계산할 수 없는 것은 뺀다. 순서가 뒤집히지 않게 뒤 해피콜을 뒤로 민다. */
export function planTimedCalls(rules: TimedCallRules, options: PlanOptions): PlannedCall[] {
  const { pickupDate, supplyDays, includePickupCheck = true, minGap = 0, floor } = options;
  const out: PlannedCall[] = [];
  let previous: string | null = null;
  for (const kind of ['pickupCheck', 'middle', 'revisit'] as const) {
    if (kind === 'pickupCheck' && !includePickupCheck) continue;
    let date = timingDate(rules[kind], pickupDate, supplyDays);
    if (!date) continue;
    if (floor && date < floor) date = floor;
    if (previous) {
      const earliest = addDaysKst(previous, minGap);
      if (date < earliest) date = earliest;
    }
    out.push({ kind, slot: TIMED_CALL_SLOT[kind], callDate: date });
    previous = date;
  }
  return out;
}

/** 구매 목록·엑셀·등록 폼에 보여 줄 1·2·3차 날짜(꺼져 있으면 null). */
export function specialCallDates(rules: SpecialRules, pickupDate: string, supplyDays: number): { callDate1: string | null; callDate2: string | null; callDate3: string | null } {
  const planned = planTimedCalls(rules, { pickupDate, supplyDays });
  const at = (slot: number) => planned.find((p) => p.slot === slot)?.callDate ?? null;
  return { callDate1: at(1), callDate2: at(2), callDate3: at(3) };
}

/** 처방일수 없이 수령일만 있는 구매의 해피콜 날짜(꺼져 있으면 null). */
export function specialSingleCallDate(rules: SpecialRules, pickupDate: string): string | null {
  return rules.withoutSupply.enabled ? addDaysKst(pickupDate, rules.withoutSupply.days) : null;
}

// ---- 화면 설명 ----

/** "수령일 +1일", "약이 끝나기 5일 전", "처방 기간에 맞춰 자동" */
export function timingText(t: CallTiming): string {
  if (!t.enabled) return '안 함';
  if (t.mode === 'after-pickup') return t.days === 0 ? '수령일 당일' : `수령일 +${t.days}일`;
  if (t.mode === 'before-end') return `약이 끝나기 ${t.days}일 전`;
  return '처방 기간에 맞춰 자동';
}

// ---- 린다이어트 미리보기 ----

/** 디톡스를 하는 일수 — 다이어트환은 디톡스 시작일 + 이 일수째에 시작한다(lib/careKind.ts DETOX_DAYS 와 같다). */
const PREVIEW_DETOX_DAYS = 3;

export interface DietSchedulePreview {
  /** 디톡스 기간에 직원이 해피콜하는 날들 */
  desk: string[];
  /** 다이어트환 시작일부터 원장이 매일 카톡하는 날들 */
  ownerDaily: string[];
  /** 그 뒤 주 1회 문안을 보내는 날들 */
  weekly: string[];
  pillStart: string;
}

/** 디톡스 시작일이 이날일 때 규칙대로 연락할 날들(규칙 화면의 예시용). */
export function dietSchedulePreview(rules: DietRules, detoxStart: string): DietSchedulePreview {
  const pillStart = addDaysKst(detoxStart, PREVIEW_DETOX_DAYS);
  const desk = Array.from({ length: rules.detoxCallDays }, (_, i) => addDaysKst(detoxStart, i));
  const ownerDaily = Array.from({ length: rules.pillDailyDays }, (_, i) => addDaysKst(pillStart, i));
  const weekly: string[] = [];
  if (rules.weeklyEnabled) {
    for (let since = rules.pillDailyDays; since < rules.pillDailyDays + rules.weeklyWeeks * 7; since++) {
      const date = addDaysKst(pillStart, since);
      if (weekdayKo(date) === rules.weeklyWeekday) weekly.push(date);
    }
  }
  return { desk, ownerDaily, weekly, pillStart };
}
