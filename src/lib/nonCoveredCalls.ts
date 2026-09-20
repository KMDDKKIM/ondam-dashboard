// 비급여 구매에 딸린 해피콜(happy_call_manual_entries)을 어떻게 만들고, 수령일/처방일수를 고쳤을 때
// 어떻게 다시 맞출지 정하는 순수 로직. DB 접근은 src/lib/supabase/nonCoveredPurchases.ts.

import { addDays, computeHerbCallDates } from './happyCallStats';

export type CallSlot = 1 | 2 | 3;
export const CALL_SLOTS: readonly CallSlot[] = [1, 2, 3];

export interface DesiredCall {
  slot: CallSlot;
  callDate: string;
  note: string;
}

/**
 * 수령일 + 처방일수가 있으면 한약 처방과 같은 공식으로 3회, 수령일만 있으면 수령일 다음날 1회,
 * 수령일이 없으면 콜 없음.
 */
export function desiredCalls(
  productName: string,
  happyCallDate: string | null,
  durationDays: number | null
): DesiredCall[] {
  if (!happyCallDate) return [];
  if (durationDays) {
    const { callDate1, callDate2, callDate3 } = computeHerbCallDates(happyCallDate, durationDays);
    return [
      { slot: 1, callDate: callDate1, note: `${productName} 수령 후속 1차` },
      { slot: 2, callDate: callDate2, note: `${productName} 수령 후속 2차` },
      { slot: 3, callDate: callDate3, note: `${productName} 수령 후속 3차(종료 임박)` },
    ];
  }
  return [{ slot: 1, callDate: addDays(happyCallDate, 1), note: `비급여 구매 후속 - ${productName}` }];
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
