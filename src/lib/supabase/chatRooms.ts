import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatRoom, ChatRoomWithUnread } from '@/lib/types';

interface RoomWithUnreadRow {
  room_id: string;
  name: string;
  kind: 'topic' | 'chat';
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  last_message_at: string | null;
  unread_count: number;
}

function rowToRoomWithUnread(row: RoomWithUnreadRow): ChatRoomWithUnread {
  return {
    id: row.room_id,
    name: row.name,
    kind: row.kind,
    isPublic: row.is_public,
    createdBy: row.created_by,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
  };
}

export async function listRoomsWithUnread(supabase: SupabaseClient): Promise<ChatRoomWithUnread[]> {
  const { data, error } = await supabase.rpc('list_rooms_with_unread');
  if (error) throw error;
  return (data as RoomWithUnreadRow[]).map(rowToRoomWithUnread);
}

export interface NewChatRoom {
  name: string;
  kind: 'topic' | 'chat';
  isPublic: boolean;
  memberStaffIds: string[];
  createdBy: string | null;
}

export async function createChatRoom(supabase: SupabaseClient, input: NewChatRoom): Promise<ChatRoom> {
  const { data, error } = await supabase
    .from('chat_rooms')
    .insert({
      name: input.name,
      kind: input.kind,
      is_public: input.isPublic,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;

  if (!input.isPublic) {
    const memberIds = Array.from(
      new Set([...input.memberStaffIds, input.createdBy].filter((id): id is string => Boolean(id)))
    );
    if (memberIds.length > 0) {
      const { error: memberError } = await supabase
        .from('chat_room_members')
        .insert(memberIds.map((staffId) => ({ room_id: data.id, staff_id: staffId })));
      if (memberError) throw memberError;
    }
  }

  return {
    id: data.id,
    name: data.name,
    kind: data.kind,
    isPublic: data.is_public,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

export async function markRoomRead(supabase: SupabaseClient, roomId: string, staffId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_room_members')
    .upsert(
      { room_id: roomId, staff_id: staffId, last_read_at: new Date().toISOString() },
      { onConflict: 'room_id,staff_id' }
    );
  if (error) throw error;
}
