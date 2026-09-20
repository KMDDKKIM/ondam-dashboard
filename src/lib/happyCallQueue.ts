// 해피콜 목록/홈 위젯이 함께 쓰는 순수 로직(상태 전이, 재시도, 미루기, 연체).
// DB 접근은 src/lib/supabase/happyCallQueue.ts 에 있고, 여기는 날짜 문자열만 다룬다.
// 모든 날짜는 한국(Asia/Seoul) 날짜 YYYY-MM-DD 이며 주말/공휴일 보정은 하지 않는다.
//
// 규칙(원장님 결정):
//  - 콜은 1건. 부재중이면 다음날 딱 한 번 더 건다(2차 콜).
//  - 두 번째도 부재중이면 "연락 안 됨"으로 종료한다.
//  - 바빠서 못 걸면 "내일로 미루기"(예정일을 내일로).
//  - 예정일이 지난 미완료 콜은 계속 목록에 남고 가장 위에 정렬된다.

import type { HappyCallPatient } from './types';
import { addDaysKst, diffDaysKst, kstDateOf } from './kst';

export type CallKind = 'firstVisit' | 'herb' | 'diet' | 'manual';

/** 저장되는 결과값. no_answer 는 "1차 부재중, 재시도 대기"(콜은 아직 열려 있음). */
export type CallResult = 'answered' | 'no_answer' | 'refused' | 'unreachable';

/** 직원이 고를 수 있는 결과(unreachable 은 두 번째 부재중일 때 자동으로 정해진다). */
export type CallAction = 'answered' | 'no_answer' | 'refused';

export const CALL_RESULT_LABEL: Record<CallResult, string> = {
  answered: '통화완료',
  no_answer: '부재중',
  refused: '거부/연락불가',
  unreachable: '연락 안 됨',
};

export const CALL_KIND_LABEL: Record<CallKind, string> = {
  firstVisit: '초진',
  herb: '한약',
  diet: '린다이어트',
  manual: '비급여/수동',
};

/** 부재중까지 포함해 최대 이만큼 건다(1차 + 재시도 1번). */
export const MAX_ATTEMPTS = 2;

export interface CallProgress {
  dueDate: string;
  attempts: number;
  result: CallResult | null;
  closed: boolean;
}

export function isClosedResult(result: CallResult | null): boolean {
  return result === 'answered' || result === 'refused' || result === 'unreachable';
}

/** 내일(한국 날짜). 미루기와 재시도 예정일에 쓴다. */
export function tomorrowKst(today: string): string {
  return addDaysKst(today, 1);
}

/**
 * 결과를 기록했을 때의 다음 상태.
 * - answered/refused: 종료.
 * - no_answer: 이번이 2번째 시도면 unreachable 로 종료, 아니면 예정일을 내일로 미루고 열어 둔다.
 */
export function applyCallAction(
  current: { dueDate: string; attempts: number },
  action: CallAction,
  today: string
): CallProgress {
  const attempts = current.attempts + 1;
  if (action === 'no_answer') {
    if (attempts >= MAX_ATTEMPTS) {
      return { dueDate: current.dueDate, attempts, result: 'unreachable', closed: true };
    }
    return { dueDate: tomorrowKst(today), attempts, result: 'no_answer', closed: false };
  }
  return { dueDate: current.dueDate, attempts, result: action, closed: true };
}

/** 내일로 미루기: 시도 횟수는 그대로, 예정일만 내일로. */
export function postponeCall(current: { dueDate: string; attempts: number; result: CallResult | null }, today: string): CallProgress {
  return {
    dueDate: tomorrowKst(today),
    attempts: current.attempts,
    result: current.result,
    closed: false,
  };
}

/**
 * 되돌리기: 마지막 결과 기록을 취소해 한 단계 전 상태로.
 * 열려 있던 "부재중"(예정일이 내일로 옮겨진 상태)을 되돌리면 오늘 콜로 돌아온다.
 * 종료된 콜을 되돌리면 예정일은 그대로 두고(종료 시 바뀌지 않는다) 다시 열린다.
 */
export function undoCallAction(
  current: { dueDate: string; attempts: number; result: CallResult | null },
  today: string
): CallProgress {
  const attempts = Math.max(0, current.attempts - 1);
  return {
    dueDate: current.result === 'no_answer' ? today : current.dueDate,
    attempts,
    result: attempts > 0 ? 'no_answer' : null,
    closed: false,
  };
}

/** 지금 걸 콜이 몇 차인지(1차, 2차 = 재시도). */
export function callOrdinal(attempts: number): number {
  return attempts + 1;
}

/** 예정일이 오늘보다 며칠 지났는지(지나지 않았으면 0). */
export function overdueDays(dueDate: string, today: string): number {
  return Math.max(0, diffDaysKst(dueDate, today));
}

// --- 초진환자(happy_call_patients)는 콜 전용 행이 없어 환자 행에서 상태를 만든다 ---

/** 초진 콜의 기본 예정일 = 초진일 다음날. call_due_date 가 있으면(재시도/미루기) 그것이 우선. */
export function firstVisitProgress(p: HappyCallPatient): CallProgress {
  const dueDate = p.callDueDate ?? addDaysKst(p.firstVisitDate, 1);
  const attempts = p.callAttempts ?? 0;
  const result = p.callResult ?? null;
  if (result !== null) {
    return { dueDate, attempts, result, closed: isClosedResult(result) };
  }
  // 결과 기능이 생기기 전에 통화내역(call_log)만 적어 둔 옛 행은 통화 완료로 본다.
  if (p.callLog) {
    return { dueDate, attempts, result: 'answered', closed: true };
  }
  return { dueDate, attempts, result: null, closed: false };
}

// --- 목록 ---

export interface WorklistItem {
  /** 화면 key (종류 + 행 id + 번호) */
  key: string;
  kind: CallKind;
  /** 원본 행 id (한약은 처방 id) */
  id: string;
  /** 한약 처방의 몇 번째 콜인지(1~3). 다른 종류는 없음 */
  callNumber?: 1 | 2 | 3;
  patientName: string;
  phone: string | null;
  doctorStaffId: string | null;
  dueDate: string;
  attempts: number;
  result: CallResult | null;
  closed: boolean;
  /** 직원이 남긴 통화 메모 */
  memo: string | null;
  /** 콜을 만들 때 붙은 안내 문구(비급여/수동 콜) */
  note: string | null;
  completedBy: string | null;
  completedAt: string | null;
}

export function isOpenAndDue(item: Pick<WorklistItem, 'closed' | 'dueDate'>, today: string): boolean {
  return !item.closed && item.dueDate <= today;
}

/** 오늘(한국) 결과를 기록한 콜인가 — 종료됐거나, 1차 부재중으로 재시도 대기 중인 콜. */
export function isProcessedToday(item: WorklistItem, today: string): boolean {
  if (!item.completedAt) return false;
  if (kstDateOf(item.completedAt) !== today) return false;
  return item.closed || item.result === 'no_answer';
}

export interface Worklist {
  /** 예정일 ≤ 오늘인 미완료 콜. 연체(예정일이 더 이른 것)가 위로 온다. */
  open: WorklistItem[];
  /** 오늘 결과를 기록한 콜(되돌리기 대상). 최근 처리한 것이 위로 온다. */
  doneToday: WorklistItem[];
}

export function buildWorklist(items: WorklistItem[], today: string): Worklist {
  const open = items
    .filter((i) => isOpenAndDue(i, today))
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.patientName.localeCompare(b.patientName, 'ko') ||
        a.key.localeCompare(b.key)
    );
  const doneToday = items
    .filter((i) => isProcessedToday(i, today))
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return { open, doneToday };
}
