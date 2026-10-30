// 한약 처방전을 기준으로 해피콜 일정을 정하는 순수 로직(원장 결정, 2026-10-14). 화면/DB 코드는 따로 있다(supabase/herbPickup.ts).
//
// 흐름: 처방전을 출력하면 한약 대기방에 "수령예정일 입력 대기"가 뜨고, 데스크가 수령예정일을 넣으면 이 일정으로 해피콜이 만들어진다.
// 언제 거는지는 비급여 현황 > 해피콜 규칙(lib/happyCallRules.ts)이 정한다. 처음 정해진 방식은 이렇다.
//  - 수령확인: 수령예정일 + 1일(직원 요청, 2026-10-30; 처음엔 +2일) — 한 번의 한약 복용(처방이 이어지는 동안)에서 첫 처방전에만 만든다.
//  - 중간상담: 수령예정일 + (며칠분 − 앞당기는 일수) — 약이 떨어지기 전에 연락해 다음 처방·내원을 잡는다.
//  - 내원 유도: 기본은 꺼 둠(규칙에서 켠다).
// 기준은 첩수가 아니라 "며칠분"이다(하루 2첩으로 짓는 분도 있어서).

import { addDays } from './happyCallStats';
import { DEFAULT_RULES, middleCallLead, planTimedCalls, type TimedCallRules } from './happyCallRules';
import type { DesiredCall } from './nonCoveredCalls';

export { middleCallLead };

/** 같은 환자의 처방전이 이전 처방이 끝난 뒤 이 일수 안에 이어지면 같은 복용 과정(재처방)으로 본다. */
export const COURSE_GAP_DAYS = 30;

/** 처방전의 며칠분 — 며칠분을 안 적었으면 첩수로 본다(하루 1첩 기본). 둘 다 없으면 0. */
export function orderDays(order: { daysSupply?: number | null; packetCount?: number | null }): number {
  const d = Number(order.daysSupply ?? 0);
  if (d > 0) return Math.round(d);
  const p = Number(order.packetCount ?? 0);
  return p > 0 ? Math.round(p) : 0;
}

export interface PrescriptionCallInput {
  pickupDate: string;
  days: number;
  /** 이 처방전이 새 복용 과정의 첫 처방전인가(수령확인을 거는 처방전) */
  firstOfCourse: boolean;
}

/**
 * 수령예정일을 정한 처방전의 해피콜 일정(slot 1 = 수령확인, slot 2 = 중간상담, slot 3 = 내원 유도). 꺼진 규칙은 만들지 않고,
 * 며칠분을 모르면(0) 며칠분이 필요한 방식(약 소진 기준·자동)은 만들지 않는다.
 * 아주 짧은 처방(예: 3일분)에서도 뒤 해피콜이 앞 해피콜보다 앞서거나 같은 날이 되지 않게 하루씩 밀고, 수령예정일 당일에는 걸지 않는다.
 */
export function prescriptionCalls(input: PrescriptionCallInput, rules: TimedCallRules = DEFAULT_RULES.herb): DesiredCall[] {
  const suffix = input.days > 0 ? ` (${input.days}일분)` : '';
  const notes = { pickupCheck: '한약 수령확인', middle: `한약 중간상담${suffix}`, revisit: `한약 내원 유도${suffix}` };
  return planTimedCalls(rules, {
    pickupDate: input.pickupDate,
    supplyDays: input.days,
    includePickupCheck: input.firstOfCourse,
    minGap: 1,
    floor: addDays(input.pickupDate, 1),
  }).map((c) => ({ slot: c.slot, callDate: c.callDate, note: notes[c.kind] }));
}

export interface PriorOrder {
  orderDate: string;
  days: number;
}

/**
 * 이 처방전(orderDate)이 새 복용 과정의 첫 처방전인가. 같은 환자의 이전 처방전 중 "처방일 + 며칠분 + COURSE_GAP_DAYS" 안에
 * 이 처방전이 든 것이 있으면 재처방(이어지는 처방)이라 수령확인을 또 걸지 않는다.
 */
export function isFirstOfCourse(orderDate: string, priorOrders: PriorOrder[]): boolean {
  return !priorOrders.some((p) => p.orderDate <= orderDate && orderDate <= addDays(p.orderDate, p.days + COURSE_GAP_DAYS));
}
