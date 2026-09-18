import type { ChatRoomWithUnread } from './types';

export function totalUnreadCount(rooms: ChatRoomWithUnread[]): number {
  return rooms.reduce((sum, room) => sum + room.unreadCount, 0);
}

export function groupRoomsByKind(rooms: ChatRoomWithUnread[]): {
  topics: ChatRoomWithUnread[];
  chats: ChatRoomWithUnread[];
} {
  return {
    topics: rooms.filter((room) => room.kind === 'topic'),
    chats: rooms.filter((room) => room.kind === 'chat'),
  };
}
