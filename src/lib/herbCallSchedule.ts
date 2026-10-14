// 한약 처방전을 기준으로 해피콜 일정을 정하는 순수 로직(원장 결정, 2026-10-14). 화면/DB 코드는 따로 있다(supabase/herbPickup.ts).
//
// 흐름: 처방전을 출력하면 한약 대기방에 "수령예정일 입력 대기"가 뜨고, 데스크가 수령예정일을 넣으면 이 일정으로 해피콜이 만들어진다.
//  - 수령확인: 수령예정일 + 2일 — 한 번의 한약 복용(처방이 이어지는 동안)에서 첫 처방전에만 만든다.
//  - 중간상담: 수령예정일 + (며칠분 − 앞당기는 일수) — 약이 떨어지기 전에 연락해 다음 처방·내원을 잡는다.
// 기준은 첩수가 아니라 "며칠분"이다(하루 2첩으로 짓는 분도 있어서).

import { addDays } from './happyCallStats';
import type { DesiredCall } from './nonCoveredCalls';

/** 수령예정일로부터 며칠 뒤에 "수령확인" 전화를 거는지 */
export const PICKUP_CHECK_AFTER_DAYS = 2;

/** 같은 환자의 처방전이 이전 처방이 끝난 뒤 이 일수 안에 이어지면 같은 복용 과정(재처방)으로 본다. */
export const COURSE_GAP_DAYS = 30;

/**
 * 중간상담을 며칠분 끝나기 며칠 전에 거는지. 10일분→8일차, 15일분→12일차, 30일분→25일차(원장 예시)에 맞춰
 * 일수의 1/6(반올림)이고 최소 2일이다. 20일분은 17일차, 60일분은 50일차, 90일분은 75일차.
 */
export function middleCallLead(daysSupply: number): number {
  return Math.max(2, Math.round(daysSupply / 6));
}

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

/** 수령예정일을 정한 처방전의 해피콜 일정(slot 1 = 수령확인, slot 2 = 중간상담). 며칠분을 모르면(0) 중간상담은 만들지 않는다. */
export function prescriptionCalls(input: PrescriptionCallInput): DesiredCall[] {
  const calls: DesiredCall[] = [];
  const pickupCheck = addDays(input.pickupDate, PICKUP_CHECK_AFTER_DAYS);
  if (input.firstOfCourse) calls.push({ slot: 1, callDate: pickupCheck, note: '한약 수령확인' });
  if (input.days > 0) {
    let middle = addDays(input.pickupDate, input.days - middleCallLead(input.days));
    // 아주 짧은 처방(예: 3일분)에서 수령확인보다 앞서거나 같은 날이 되지 않게 한다.
    const earliest = addDays(input.pickupDate, input.firstOfCourse ? PICKUP_CHECK_AFTER_DAYS + 1 : 1);
    if (middle < earliest) middle = earliest;
    calls.push({ slot: 2, callDate: middle, note: `한약 중간상담 (${input.days}일분)` });
  }
  return calls;
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
