// 홈 화면 "할 일·전달사항"의 순수 로직. 화면/DB 코드는 따로 있다.
//  - self   : 내가 해야 할 일 (본인만 보고 완료만 누른다)
//  - order  : 다른 직원에게 하는 오더 (받은 사람이 "완료")
//  - notice : 전달사항 (받은 사람이 "숙지")
// 직원 한 명당 한 줄이다 — 여러 명에게 보내면 사람 수만큼 줄이 생겨서 각자 따로 완료한다.

export type WorkKind = 'self' | 'order' | 'notice';

export interface WorkItem {
  id: string;
  kind: WorkKind;
  content: string;
  createdBy: string;
  assigneeId: string;
  dueDate: string | null;
  doneAt: string | null;
  createdAt: string;
}

/** 끝낸 항목을 화면에 남겨 두는 기간(일). 지나면 목록에서 빠진다. */
export const DONE_VISIBLE_DAYS = 3;

export interface WorkBoard {
  /** 내가 받은 오더·전달 중 아직 안 끝낸 것 */
  received: WorkItem[];
  /** 내가 받아서 끝낸 것(최근 DONE_VISIBLE_DAYS일) */
  receivedDone: WorkItem[];
  /** 내 할 일(안 끝낸 것 + 최근에 끝낸 것) */
  mine: WorkItem[];
  /** 내가 보낸 오더·전달(안 끝낸 것 + 최근에 끝낸 것) — 상대가 끝냈는지 여기서 본다 */
  sent: WorkItem[];
}

export function actionLabel(kind: WorkKind): string {
  return kind === 'notice' ? '숙지' : '완료';
}

export function doneLabel(kind: WorkKind): string {
  return kind === 'notice' ? '숙지함' : '완료함';
}

export function kindLabel(kind: WorkKind): string {
  return kind === 'self' ? '내 할 일' : kind === 'order' ? '오더' : '전달사항';
}

function isRecentlyDone(item: WorkItem, nowMs: number): boolean {
  if (!item.doneAt) return false;
  const doneMs = Date.parse(item.doneAt);
  return Number.isFinite(doneMs) && nowMs - doneMs < DONE_VISIBLE_DAYS * 24 * 60 * 60 * 1000;
}

/** 마감일이 있는 안 끝낸 항목 먼저(빠른 순), 마감일 없는 것은 먼저 만든 순. */
function compareOpen(a: WorkItem, b: WorkItem): number {
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  return a.createdAt.localeCompare(b.createdAt);
}

function compareDone(a: WorkItem, b: WorkItem): number {
  return (b.doneAt ?? '').localeCompare(a.doneAt ?? '');
}

/** 안 끝낸 것을 앞에, 최근에 끝낸 것을 뒤에 둔다(오래전에 끝낸 것은 뺀다). */
function openThenRecentDone(items: WorkItem[], nowMs: number): WorkItem[] {
  const open = items.filter((i) => !i.doneAt).sort(compareOpen);
  const done = items.filter((i) => isRecentlyDone(i, nowMs)).sort(compareDone);
  return [...open, ...done];
}

export function buildWorkBoard(items: WorkItem[], myId: string | null, nowMs: number): WorkBoard {
  if (!myId) return { received: [], receivedDone: [], mine: [], sent: [] };
  const mine: WorkItem[] = [];
  const received: WorkItem[] = [];
  const sent: WorkItem[] = [];
  for (const item of items) {
    if (item.kind === 'self') {
      if (item.createdBy === myId && item.assigneeId === myId) mine.push(item);
    } else if (item.assigneeId === myId && item.createdBy !== myId) received.push(item);
    else if (item.createdBy === myId && item.assigneeId !== myId) sent.push(item);
  }
  return {
    received: received.filter((i) => !i.doneAt).sort(compareOpen),
    receivedDone: received.filter((i) => isRecentlyDone(i, nowMs)).sort(compareDone),
    mine: openThenRecentDone(mine, nowMs),
    sent: openThenRecentDone(sent, nowMs),
  };
}

/** 마감일이 지났는데 안 끝났는가. */
export function isOverdue(item: Pick<WorkItem, 'dueDate' | 'doneAt'>, today: string): boolean {
  return !item.doneAt && !!item.dueDate && item.dueDate < today;
}

/** "10/3 14:20" — 한국 시간. */
export function formatKstTime(iso: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('month')}/${get('day')} ${hour}:${get('minute')}`;
}
