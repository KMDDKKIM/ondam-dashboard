import { describe, expect, it } from 'vitest';
import { actionLabel, buildWorkBoard, calendarDateOf, dayChips, deadlineLabel, doneLabel, formatKstTime, isOverdue, kstDateOf, removeAction, workItemsForDate, type WorkItem } from './workItems';

// 사람·내용은 모두 시험용 가짜 값이다.
const ME = 'me';
const OTHER = 'other';
const NOW = Date.parse('2026-10-05T03:00:00Z'); // 한국 12:00
const item = (o: Partial<WorkItem> = {}): WorkItem => ({
  id: 'w1',
  kind: 'order',
  content: '시험 내용',
  createdBy: OTHER,
  assigneeId: ME,
  dueDate: null,
  deadline: null,
  doneAt: null,
  createdAt: '2026-10-05T00:00:00Z',
  ...o,
});

describe('buildWorkBoard', () => {
  it('내가 받은 것·내 할 일·내가 보낸 것으로 나눈다', () => {
    const board = buildWorkBoard(
      [
        item({ id: 'recv' }),
        item({ id: 'mine', kind: 'self', createdBy: ME, assigneeId: ME }),
        item({ id: 'sent', createdBy: ME, assigneeId: OTHER }),
      ],
      ME,
      NOW
    );
    expect(board.received.map((i) => i.id)).toEqual(['recv']);
    expect(board.mine.map((i) => i.id)).toEqual(['mine']);
    expect(board.sent.map((i) => i.id)).toEqual(['sent']);
  });

  it('남의 내 할 일이나 나와 상관없는 줄은 보이지 않는다', () => {
    const board = buildWorkBoard(
      [item({ id: 'a', kind: 'self', createdBy: OTHER, assigneeId: OTHER }), item({ id: 'b', createdBy: OTHER, assigneeId: 'third' })],
      ME,
      NOW
    );
    expect(board).toEqual({ received: [], receivedDone: [], mine: [], sent: [] });
  });

  it('로그인 정보가 없으면 비어 있다', () => {
    expect(buildWorkBoard([item()], null, NOW).received).toEqual([]);
  });

  it('끝낸 것은 3일 동안만 남기고, 안 끝낸 것은 뒤에 끝낸 것을 둔다', () => {
    const board = buildWorkBoard(
      [
        item({ id: 'old', createdBy: ME, assigneeId: OTHER, doneAt: '2026-10-01T00:00:00Z' }),
        item({ id: 'recent', createdBy: ME, assigneeId: OTHER, doneAt: '2026-10-04T00:00:00Z' }),
        item({ id: 'open', createdBy: ME, assigneeId: OTHER }),
      ],
      ME,
      NOW
    );
    expect(board.sent.map((i) => i.id)).toEqual(['open', 'recent']);
  });

  it('받은 것은 끝낸 것이 receivedDone으로 간다', () => {
    const board = buildWorkBoard([item({ id: 'a' }), item({ id: 'b', doneAt: '2026-10-05T01:00:00Z' })], ME, NOW);
    expect(board.received.map((i) => i.id)).toEqual(['a']);
    expect(board.receivedDone.map((i) => i.id)).toEqual(['b']);
  });

  it('마감기한이 빠른 것이 먼저, 마감기한 없는 것은 만든 순', () => {
    const board = buildWorkBoard(
      [
        item({ id: 'none-late', createdAt: '2026-10-05T02:00:00Z' }),
        item({ id: 'due-late', deadline: '2026-10-09' }),
        item({ id: 'none-early', createdAt: '2026-10-05T01:00:00Z' }),
        item({ id: 'due-early', deadline: '2026-10-06' }),
      ],
      ME,
      NOW
    );
    expect(board.received.map((i) => i.id)).toEqual(['due-early', 'due-late', 'none-early', 'none-late']);
  });
});

describe('labels', () => {
  it('할 일은 완료, 요청·전달사항은 확인(예전 전달사항도 같다)', () => {
    expect(actionLabel('self')).toBe('완료');
    expect(actionLabel('order')).toBe('확인');
    expect(actionLabel('notice')).toBe('확인');
    expect(doneLabel('self')).toBe('완료함');
    expect(doneLabel('order')).toBe('확인함');
    expect(doneLabel('notice')).toBe('확인함');
  });
});

describe('isOverdue', () => {
  it('마감기한이 지났고 안 끝났을 때만', () => {
    expect(isOverdue({ deadline: '2026-10-04', doneAt: null }, '2026-10-05')).toBe(true);
    expect(isOverdue({ deadline: '2026-10-05', doneAt: null }, '2026-10-05')).toBe(false);
    expect(isOverdue({ deadline: '2026-10-04', doneAt: '2026-10-04T01:00:00Z' }, '2026-10-05')).toBe(false);
    expect(isOverdue({ deadline: null, doneAt: null }, '2026-10-05')).toBe(false);
  });
});

describe('deadlineLabel', () => {
  const T = '2026-10-05';

  it('마감기한이 없으면 null', () => {
    expect(deadlineLabel(null, T)).toBeNull();
  });

  it('지남·오늘은 빨갛게, 내일·그 뒤는 차분하게', () => {
    expect(deadlineLabel('2026-10-02', T)).toEqual({ text: '마감 지남 10/2', urgent: true });
    expect(deadlineLabel('2026-10-05', T)).toEqual({ text: '오늘 마감', urgent: true });
    expect(deadlineLabel('2026-10-06', T)).toEqual({ text: '내일 마감', urgent: false });
    expect(deadlineLabel('2026-10-12', T)).toEqual({ text: '마감 10/12', urgent: false });
  });
});

describe('formatKstTime', () => {
  it('한국 시간으로 "월/일 시:분"', () => {
    expect(formatKstTime('2026-10-03T05:20:00Z')).toBe('10/3 14:20');
  });

  it('자정은 00시', () => {
    expect(formatKstTime('2026-10-03T15:05:00Z')).toBe('10/4 00:05');
  });
});

describe('달력 날짜', () => {
  const TODAY = '2026-10-05';

  it('한국 날짜로 바꾼다', () => {
    expect(kstDateOf('2026-10-04T16:00:00Z')).toBe('2026-10-05');
    expect(kstDateOf('2026-10-05T14:59:00Z')).toBe('2026-10-05');
  });

  it('마감일이 있으면 그 날짜, 없으면 올린 날', () => {
    expect(calendarDateOf({ dueDate: '2026-10-08', createdAt: '2026-10-05T00:00:00Z' })).toBe('2026-10-08');
    expect(calendarDateOf({ dueDate: null, createdAt: '2026-10-05T00:00:00Z' })).toBe('2026-10-05');
  });

  it('오늘을 고르면 밀린 안 끝난 것이 따라오고, 끝난 밀린 것은 안 따라온다', () => {
    const items = [
      item({ id: 'today', dueDate: '2026-10-05' }),
      item({ id: 'late-open', dueDate: '2026-10-02' }),
      item({ id: 'late-done', dueDate: '2026-10-02', doneAt: '2026-10-03T00:00:00Z' }),
      item({ id: 'future', dueDate: '2026-10-09' }),
    ];
    expect(workItemsForDate(items, TODAY, TODAY).map((i) => i.id)).toEqual(['today', 'late-open']);
  });

  it('다른 날짜를 고르면 그 날짜에 놓인 것만(끝난 것도) 보인다', () => {
    const items = [item({ id: 'late-open', dueDate: '2026-10-02' }), item({ id: 'late-done', dueDate: '2026-10-02', doneAt: '2026-10-03T00:00:00Z' }), item({ id: 'future', dueDate: '2026-10-09' })];
    expect(workItemsForDate(items, '2026-10-02', TODAY).map((i) => i.id)).toEqual(['late-open', 'late-done']);
    expect(workItemsForDate(items, '2026-10-09', TODAY).map((i) => i.id)).toEqual(['future']);
  });

  it('달력 칸에는 받은 것 → 내 할 일 → 보낸 것 순으로, 안 끝난 것이 앞에 뜬다', () => {
    const items = [
      item({ id: 'sent', createdBy: ME, assigneeId: OTHER, dueDate: '2026-10-09' }),
      item({ id: 'mine-done', kind: 'self', createdBy: ME, assigneeId: ME, dueDate: '2026-10-09', doneAt: '2026-10-05T01:00:00Z' }),
      item({ id: 'mine', kind: 'self', createdBy: ME, assigneeId: ME, dueDate: '2026-10-09' }),
      item({ id: 'recv', dueDate: '2026-10-09' }),
      item({ id: 'recv-done', dueDate: '2026-10-09', doneAt: '2026-10-05T01:00:00Z' }),
    ];
    expect(dayChips(items, ME, '2026-10-09', TODAY, NOW).map((c) => `${c.role}:${c.id}${c.done ? ':done' : ''}`)).toEqual([
      'received:recv',
      'mine:mine',
      'mine:mine-done:done',
      'sent:sent',
    ]);
    expect(dayChips(items, ME, '2026-10-10', TODAY, NOW)).toEqual([]);
  });

  it('마감기한 날짜 칸에도 안 끝난 것은 "마감"으로 뜬다', () => {
    const items = [item({ id: 'a', dueDate: '2026-10-06', deadline: '2026-10-09' }), item({ id: 'b', dueDate: '2026-10-06', deadline: '2026-10-09', doneAt: '2026-10-06T01:00:00Z' })];
    expect(dayChips(items, ME, '2026-10-09', TODAY, NOW).map((c) => [c.id, c.deadlineDay])).toEqual([['a', true]]);
    expect(dayChips(items, ME, '2026-10-06', TODAY, NOW).map((c) => [c.id, c.deadlineDay])).toEqual([
      ['a', false],
    ]);
  });
});

describe('removeAction', () => {
  it('내 할 일은 "삭제"', () => {
    expect(removeAction(item({ kind: 'self', createdBy: ME, assigneeId: ME }))).toEqual({ verb: '삭제', confirmLabel: '삭제' });
  });

  it('상대가 이미 확인한 요청·전달은 기록을 지우는 것이라 "삭제"', () => {
    expect(removeAction(item({ createdBy: ME, assigneeId: OTHER, doneAt: '2026-10-05T01:00:00Z' }))).toEqual({ verb: '삭제', confirmLabel: '삭제' });
  });

  it('아직 확인 안 한 요청·전달은 "취소"지만, 확인창 버튼은 "취소하기" — 확인창 기본 "취소"와 이름이 같으면 취소 버튼이 두 개로 보인다', () => {
    const action = removeAction(item({ createdBy: ME, assigneeId: OTHER }));
    expect(action.verb).toBe('취소');
    expect(action.confirmLabel).toBe('취소하기');
    expect(action.confirmLabel).not.toBe('취소');
  });
});

