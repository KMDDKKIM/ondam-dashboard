// 직원이 낸 연차 신청이 승인(확정)·반려됐을 때 본인에게 한 번 띄워 주는 알림 팝업의 순수 로직.
// "봤는지"는 이 브라우저의 localStorage에만 기록한다(DB 변경 없이 — 다른 기기에서는 한 번 더 보일 수 있다).

export interface NoticeCandidate {
  id: string;
  staffId: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy: string | null;
  decidedAt: string | null;
}

/** 결정된 지 이 기간(일)이 지난 건은 뒤늦게 팝업으로 띄우지 않는다(처음 접속한 기기에 옛 결과가 우르르 뜨는 것 방지). */
export const NOTICE_WINDOW_DAYS = 14;

/**
 * 아직 안 보여 준 결과 알림 대상 — 내가 신청한 건 중 승인/반려가 난 것, 내가 직접 처리한
 * 건(원장이 자기 신청을 승인)은 제외, 오래된 건 제외, 오래된 결정 순.
 */
export function unseenNotices<T extends NoticeCandidate>(
  requests: T[],
  myId: string,
  seenIds: ReadonlySet<string>,
  now: Date = new Date()
): T[] {
  const cutoff = now.getTime() - NOTICE_WINDOW_DAYS * 86400000;
  return requests
    .filter((r) => r.staffId === myId && r.status !== 'pending' && r.decidedAt !== null)
    .filter((r) => r.decidedBy !== myId)
    .filter((r) => !seenIds.has(r.id))
    .filter((r) => new Date(r.decidedAt as string).getTime() >= cutoff)
    .sort((a, b) => (a.decidedAt as string).localeCompare(b.decidedAt as string));
}
