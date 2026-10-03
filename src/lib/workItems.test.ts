import { describe, expect, it } from 'vitest';
import { actionLabel, buildWorkBoard, doneLabel, formatKstTime, isOverdue, type WorkItem } from './workItems';

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

  it('마감일이 빠른 것이 먼저, 마감일 없는 것은 만든 순', () => {
    const board = buildWorkBoard(
      [
        item({ id: 'none-late', createdAt: '2026-10-05T02:00:00Z' }),
        item({ id: 'due-late', dueDate: '2026-10-09' }),
        item({ id: 'none-early', createdAt: '2026-10-05T01:00:00Z' }),
        item({ id: 'due-early', dueDate: '2026-10-06' }),
      ],
      ME,
      NOW
    );
    expect(board.received.map((i) => i.id)).toEqual(['due-early', 'due-late', 'none-early', 'none-late']);
  });
});

describe('labels', () => {
  it('전달사항은 숙지, 오더는 완료', () => {
    expect(actionLabel('notice')).toBe('숙지');
    expect(actionLabel('order')).toBe('완료');
    expect(doneLabel('notice')).toBe('숙지함');
    expect(doneLabel('order')).toBe('완료함');
  });
});

describe('isOverdue', () => {
  it('마감일이 지났고 안 끝났을 때만', () => {
    expect(isOverdue({ dueDate: '2026-10-04', doneAt: null }, '2026-10-05')).toBe(true);
    expect(isOverdue({ dueDate: '2026-10-05', doneAt: null }, '2026-10-05')).toBe(false);
    expect(isOverdue({ dueDate: '2026-10-04', doneAt: '2026-10-04T01:00:00Z' }, '2026-10-05')).toBe(false);
    expect(isOverdue({ dueDate: null, doneAt: null }, '2026-10-05')).toBe(false);
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
