// 홈 "오늘 확인할 것"의 새 항목들을 만드는 순수 로직(화면은 TodayStatus).
// todo = 빨간 배지(해야 할 일), ok = 초록 체크, info = 회색 안내(할 일도 이상도 아님), unknown = 조회 실패.

export type TodayRowState = 'todo' | 'ok' | 'info' | 'unknown';

export interface TodayRow {
  key: string;
  icon: string;
  text: string;
  state: TodayRowState;
  badge: string;
  href: string;
}

/** 오늘 저장된 예약 명단 인원. null 이면 조회 실패. 안내용이라 절대 '해야 할 일'이 아니다. */
export function reservationRow(count: number | null): TodayRow {
  const base = { key: 'reservations', icon: '🗓️' };
  if (count == null) return { ...base, text: '오늘 예약 -', state: 'unknown', badge: '확인 불가', href: '/reservations' };
  if (count <= 0) return { ...base, text: '오늘 예약 명단이 아직 없어요', state: 'info', badge: '붙여넣기', href: '/paste-import' };
  return { ...base, text: `오늘 예약 ${count}명`, state: 'info', badge: '보기', href: '/reservations' };
}

export type FirstVisitMissingProp = { comparable: false } | { comparable: true; missing: number; expected: number; registered: number };

/** 초진·재초진 등록 누락. 비교할 결산/명단이 없으면 null(항목을 감춘다), 조회 실패(null 입력)는 '-'. */
export function firstVisitRow(value: FirstVisitMissingProp | null | undefined): TodayRow | null {
  const base = { key: 'firstVisitMissing', icon: '🩺', href: '/happy-call-register' };
  if (value === undefined) return null;
  if (value === null) return { ...base, text: '초진·재초진 등록 -', state: 'unknown', badge: '확인 불가' };
  if (!value.comparable) return null;
  if (value.missing > 0) {
    return { ...base, text: `초진·재초진 등록 누락 ${value.missing}명`, state: 'todo', badge: '등록하기' };
  }
  return { ...base, text: '초진·재초진 등록 누락 없음', state: 'ok', badge: '정상' };
}

/** 오늘 걸 해피콜. 연체가 하나라도 있으면 빨간색(todo), 없으면 회색 안내. */
export function callsRow(value: { open: number; overdue: number } | null | undefined): TodayRow | null {
  const base = { key: 'happyCalls', icon: '📞', href: '/happy-call-list' };
  if (value === undefined) return null;
  if (value === null) return { ...base, text: '오늘 걸 해피콜 -', state: 'unknown', badge: '확인 불가' };
  if (value.open <= 0) return { ...base, text: '오늘 걸 해피콜 없음', state: 'ok', badge: '정상' };
  if (value.overdue > 0) {
    return { ...base, text: `오늘 걸 해피콜 ${value.open}건 (지난 예정일 ${value.overdue}건 포함)`, state: 'todo', badge: '걸기' };
  }
  return { ...base, text: `오늘 걸 해피콜 ${value.open}건`, state: 'info', badge: '걸기' };
}

/**
 * 한약재 재고 항목. 등록된 약재가 하나도 없으면 '정상'이 아니라 중립 안내로 보여 준다
 * (재고가 0인 약재가 없는 것과 약재를 아직 등록하지 않은 것은 다르다).
 * totalCount 를 모르면(조회 실패) 재고 0 개수만으로 판단한다.
 */
export function herbStockRow(zeroStockCount: number | null, totalCount: number | null | undefined): TodayRow {
  const base = { key: 'stock', icon: '🌿', href: '/herb-inventory' };
  if (zeroStockCount == null) return { ...base, text: '한약재 재고', state: 'unknown', badge: '확인 불가' };
  if (zeroStockCount > 0) return { ...base, text: `재고가 0인 약재 ${zeroStockCount}개`, state: 'todo', badge: '확인하기' };
  if (totalCount === 0) return { ...base, text: '등록된 약재가 없어요', state: 'info', badge: '등록하기' };
  return { ...base, text: '재고가 0인 약재 없음', state: 'ok', badge: '정상' };
}
