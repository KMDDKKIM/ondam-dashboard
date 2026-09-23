// 왼쪽 메뉴의 무거운 숫자 배지(오늘 걸 해피콜, 초진 등록 누락)를 언제 다시 읽을지 정하는 순수 로직.

export const SIDEBAR_BADGE_REFRESH_MS = 60_000;

export interface SidebarBadges {
  /** 오늘 걸 해피콜 수(못 읽으면 null) */
  openCalls: number | null;
  /** 초진·재초진 등록 누락 수(비교할 기준이 없거나 못 읽으면 null) */
  missingFirstVisits: number | null;
  /** 안읽은 네이버톡톡 메시지 수(못 읽으면 null) */
  naverTalkTalkUnread: number | null;
}

/** 마지막으로 읽은 뒤 minGapMs 가 지났으면(또는 아직 읽은 적 없으면) 다시 읽는다. */
export function shouldRefreshBadges(lastFetchedAt: number | null, now: number, minGapMs: number = SIDEBAR_BADGE_REFRESH_MS): boolean {
  return lastFetchedAt === null || now - lastFetchedAt >= minGapMs;
}
