// 비급여 구매에 딸린 해피콜(happy_call_manual_entries)을 어떻게 만들고, 수령일/처방일수를 고쳤을 때
// 어떻게 다시 맞출지 정하는 순수 로직. DB 접근은 src/lib/supabase/nonCoveredPurchases.ts.

import { DEFAULT_RULES, planTimedCalls, specialSingleCallDate, type SpecialRules } from './happyCallRules';
import type { ManualCallType } from './happyCallQueue';
import type { GoalCategory } from './types';

export type CallSlot = 1 | 2 | 3;
export const CALL_SLOTS: readonly CallSlot[] = [1, 2, 3];

export interface DesiredCall {
  slot: CallSlot;
  callDate: string;
  note: string;
}

/**
 * 수령일 + 처방일수가 있으면 규칙(해피콜 규칙 > 특수한약·그 밖의 비급여)대로 수령확인·중간상담·연복 권유 최대 3회, 수령일만 있으면 규칙의 1회(기본은 수령일 다음날),
 * 수령일이 없으면 콜 없음.
 * 단 일반 한약(목표 반영 = 한약)은 처방전 출력 후 한약 대기방에서 수령예정일을 넣을 때 만들고(lib/herbCallSchedule.ts),
 * 린다이어트는 새 기준을 정할 때까지 만들지 않는다(원장 결정, 2026-10-14). 특수한약 등은 그대로.
 */
export function desiredCalls(
  productName: string,
  happyCallDate: string | null,
  durationDays: number | null,
  goalCategory: GoalCategory | null = null,
  rules: SpecialRules = DEFAULT_RULES.special
): DesiredCall[] {
  if (!happyCallDate) return [];
  if (!createsCallsFromPurchase(productName, goalCategory)) return [];
  if (durationDays) {
    const notes = { pickupCheck: `${productName} 수령확인`, middle: `${productName} 중간상담`, revisit: `${productName} 연복권유` };
    return planTimedCalls(rules, { pickupDate: happyCallDate, supplyDays: durationDays }).map((c) => ({ slot: c.slot, callDate: c.callDate, note: notes[c.kind] }));
  }
  const single = specialSingleCallDate(rules, happyCallDate);
  return single ? [{ slot: 1, callDate: single, note: `비급여 구매 후속 - ${productName}` }] : [];
}

/** 비급여 구매를 등록할 때 해피콜을 자동으로 만드는 상품인가. 한약(처방전 기준)과 린다이어트(기준 정리 중)는 아니다. */
export function createsCallsFromPurchase(productName: string, goalCategory: GoalCategory | null): boolean {
  if (goalCategory === 'herb' || goalCategory === 'diet') return false;
  return callTypeForPurchase(productName, null) !== '린다이어트';
}

export interface ExistingCall {
  slot: CallSlot;
  id: string;
  callDate: string;
  note: string | null;
  /** 이미 종료(통화완료/거부/연락 안 됨 등)된 콜 */
  closed: boolean;
  /** 시도 횟수. 0보다 크면 이미 전화를 걸어 부재중 재시도 중인 콜이다. */
  attempts: number;
}

export type CallOp =
  | { type: 'create'; slot: CallSlot; callDate: string; note: string }
  | { type: 'update'; slot: CallSlot; id: string; callDate: string; note: string }
  | { type: 'remove'; slot: CallSlot; id: string };

/**
 * 원하는 콜(desired)과 지금 있는 콜(existing)을 맞추는 작업 목록.
 * 이미 끝났거나(closed) 이미 시도한(attempts > 0) 콜은 절대 건드리지 않는다 —
 * 기록과 재시도 일정을 지키기 위해서다. 아직 손대지 않은 열린 콜만 날짜/문구를 고치거나 지운다.
 */
export function planCallResync(desired: readonly DesiredCall[], existing: readonly ExistingCall[]): CallOp[] {
  const ops: CallOp[] = [];
  for (const slot of CALL_SLOTS) {
    const want = desired.find((d) => d.slot === slot);
    const have = existing.find((e) => e.slot === slot);
    const untouched = have !== undefined && !have.closed && have.attempts === 0;
    if (want && !have) {
      ops.push({ type: 'create', slot, callDate: want.callDate, note: want.note });
    } else if (want && have && untouched) {
      if (have.callDate !== want.callDate || have.note !== want.note) {
        ops.push({ type: 'update', slot, id: have.id, callDate: want.callDate, note: want.note });
      }
    } else if (!want && have && untouched) {
      ops.push({ type: 'remove', slot, id: have.id });
    }
  }
  return ops;
}

/**
 * 규칙을 바꾼 뒤 이미 만든 해피콜에 다시 맞출 때 쓰는 거름망 — 날짜가 지난 해피콜을 새로 만들거나, 지난 날짜로 옮기지 않는다.
 * (지운다는 작업은 그대로 둔다. 예전 구매에 새 규칙의 해피콜이 한꺼번에 지난 날짜로 생기는 일을 막는다.)
 */
export function opsFromToday(ops: readonly CallOp[], today: string): CallOp[] {
  return ops.filter((op) => op.type === 'remove' || op.callDate >= today);
}

/**
 * 비급여 구매에서 만든 해피콜에 붙일 종류. 린다이어트/린데일리는 린다이어트, 처방일수가 있거나 한약류(한약·보약·경옥고·공진단·관절고)는 한약,
 * 그 밖에는 비급여.
 */
export function callTypeForPurchase(productName: string, durationDays: number | null): ManualCallType {
  if (/린다이어트|린데일리/.test(productName)) return '린다이어트';
  if (durationDays || /한약|보약|경옥고|공진단|관절고/.test(productName)) return '한약';
  return '비급여';
}
