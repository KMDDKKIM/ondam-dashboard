// 핀셋포인트(growth-mate.co.kr, 이 한의원이 쓰는 CRM)의 예약 상태를 우리 예약자 명단의
// "결과"(정상이행/노쇼/취소)로 옮기는 순수 로직. 실제 로그인·HTTP 호출은
// growthMate.server.ts(서버 전용)가 한다 — 여기서는 이름 매칭·상태 변환만 다뤄서 테스트하기 쉽게 뗐다.
import type { Reservation } from './reservations/types';

export interface GrowthMateReservation {
  patientName: string;
  /** 핀셋포인트가 쓰는 원문 상태(예: '내원완료', '예약부도', '예약취소', '내원예정', '내원예정(변경)'). */
  visitStatus: string;
}

/**
 * 핀셋포인트 상태 → 우리 "결과" 값. 아직 확정 안 된 상태(내원예정 등, 방문 전)는 null —
 * 손대지 않는다(우리 쪽에서 이미 표시해 둔 게 있으면 그대로 둔다).
 */
export function mapGrowthMateStatus(status: string): string | null {
  switch (status) {
    case '내원완료':
      return '정상이행';
    case '예약부도':
      return '노쇼';
    case '예약취소':
      return '취소';
    default:
      return null;
  }
}

function normalizeName(name: string | null | undefined): string {
  return String(name ?? '').replace(/\s+/g, '');
}

export interface GrowthMateSyncResult {
  /** visitStatus가 바뀐(또는 안 바뀐) 전체 예약 목록 — 그대로 replaceReservationsForDate에 넘기면 된다. */
  updated: Reservation[];
  /** 실제로 값이 바뀐 줄 수. */
  changedCount: number;
  /** 핀셋포인트엔 확정 상태가 있는데 우리 명단에서 이름을 못 찾은 환자 이름(중복이면 그 수만큼). */
  unmatchedNames: string[];
}

/**
 * 이름으로 대조해서 핀셋포인트의 확정 상태(정상이행/노쇼/취소)를 우리 예약 줄에 얹는다.
 * 동명이인·중복 예약을 감안해 멀티셋으로 매칭한다(한쪽에 한 번 있는 이름이 다른 쪽 여러 줄을
 * 한꺼번에 채우지 않는다) — reservationReceptionMatch.ts의 matchAttendance와 같은 방식.
 * 핀셋포인트가 더 정확한 출처라고 보고, 매칭되면 우리 쪽에 이미 표시돼 있던 값도 덮어쓴다.
 */
export function applyGrowthMateStatuses(ours: readonly Reservation[], theirs: readonly GrowthMateReservation[]): GrowthMateSyncResult {
  const pool = new Map<string, string[]>();
  for (const r of theirs) {
    const mapped = mapGrowthMateStatus(r.visitStatus);
    if (mapped == null) continue;
    const key = normalizeName(r.patientName);
    if (key === '') continue;
    const list = pool.get(key);
    if (list) list.push(mapped);
    else pool.set(key, [mapped]);
  }

  let changedCount = 0;
  const updated = ours.map((row) => {
    const key = normalizeName(row.patientName);
    const queue = pool.get(key);
    if (!queue || queue.length === 0) return row;
    const status = queue.shift()!;
    if (status === row.visitStatus) return row;
    changedCount += 1;
    return { ...row, visitStatus: status };
  });

  const unmatchedNames: string[] = [];
  for (const r of theirs) {
    const mapped = mapGrowthMateStatus(r.visitStatus);
    if (mapped == null) continue;
    const key = normalizeName(r.patientName);
    if (key === '') continue;
    const queue = pool.get(key);
    // pool의 남은 개수가 "이 이름 중 우리 쪽에서 못 찾은 개수" — theirs를 다시 돌면서
    // 그만큼만 안내 목록에 넣는다(각 이름이 남은 개수만큼 정확히 한 번씩만 찍히게).
    if (queue && queue.length > 0) {
      queue.pop();
      unmatchedNames.push(r.patientName);
    }
  }

  return { updated, changedCount, unmatchedNames };
}
