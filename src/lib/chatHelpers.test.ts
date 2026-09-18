import { describe, it, expect } from 'vitest';
import { totalUnreadCount, groupRoomsByKind } from './chatHelpers';
import type { ChatRoomWithUnread } from './types';

function makeRoom(overrides: Partial<ChatRoomWithUnread>): ChatRoomWithUnread {
  return {
    id: 'room-1',
    name: '테스트방',
    kind: 'topic',
    isPublic: true,
    createdBy: null,
    createdAt: '2026-09-18T00:00:00Z',
    lastMessageAt: null,
    unreadCount: 0,
    ...overrides,
  };
}

describe('totalUnreadCount', () => {
  it('returns 0 for an empty list', () => {
    expect(totalUnreadCount([])).toBe(0);
  });

  it('sums unread counts across rooms', () => {
    const rooms = [makeRoom({ unreadCount: 3 }), makeRoom({ unreadCount: 5 }), makeRoom({ unreadCount: 0 })];
    expect(totalUnreadCount(rooms)).toBe(8);
  });
});

describe('groupRoomsByKind', () => {
  it('splits rooms into topics and chats, preserving order', () => {
    const rooms = [
      makeRoom({ id: 'a', kind: 'topic' }),
      makeRoom({ id: 'b', kind: 'chat' }),
      makeRoom({ id: 'c', kind: 'topic' }),
    ];
    const { topics, chats } = groupRoomsByKind(rooms);
    expect(topics.map((r) => r.id)).toEqual(['a', 'c']);
    expect(chats.map((r) => r.id)).toEqual(['b']);
  });

  it('returns an empty array (not undefined) when there are no rooms of a kind', () => {
    const rooms = [makeRoom({ id: 'a', kind: 'topic' })];
    const { topics, chats } = groupRoomsByKind(rooms);
    expect(topics).toHaveLength(1);
    expect(chats).toEqual([]);
  });
});
