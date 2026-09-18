import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, ChatSearchResult } from '@/lib/types';

interface AttachmentRow {
  id: string;
  message_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
}

interface MessageRow {
  id: string;
  room_id: string;
  sender_id: string | null;
  content: string | null;
  created_at: string;
  chat_attachments: AttachmentRow[];
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    senderId: row.sender_id,
    content: row.content,
    createdAt: row.created_at,
    attachments: (row.chat_attachments ?? []).map((a) => ({
      id: a.id,
      messageId: a.message_id,
      fileUrl: a.file_url,
      fileName: a.file_name,
      fileType: a.file_type,
    })),
  };
}

export async function listMessages(supabase: SupabaseClient, roomId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*, chat_attachments(*)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data as unknown as MessageRow[]).map(rowToMessage).reverse();
}

export interface NewChatMessage {
  roomId: string;
  senderId: string;
  content: string | null;
  files: File[];
}

export async function sendMessage(supabase: SupabaseClient, input: NewChatMessage): Promise<void> {
  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({ room_id: input.roomId, sender_id: input.senderId, content: input.content })
    .select()
    .single();
  if (error) throw error;

  for (const file of input.files) {
    const path = `${input.roomId}/${message.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(path, file);
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('chat-attachments').getPublicUrl(path);

    const { error: attachError } = await supabase.from('chat_attachments').insert({
      message_id: message.id,
      file_url: publicUrlData.publicUrl,
      file_name: file.name,
      file_type: file.type || 'application/octet-stream',
    });
    if (attachError) throw attachError;
  }
}

// 새 INSERT가 올 때마다 onChange를 호출해서 호출자가 listMessages로
// 다시 불러오게 한다 — payload에서 첨부파일까지 재구성하려면 복잡해지니,
// 이 방 규모(팀 채팅)에서는 통째로 다시 불러오는 게 훨씬 단순하고 안전하다.
export function subscribeToRoomMessages(
  supabase: SupabaseClient,
  roomId: string,
  onChange: () => void
): () => void {
  const channel = supabase
    .channel(`chat_messages:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
      () => {
        onChange();
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

interface SearchRow {
  id: string;
  room_id: string;
  content: string | null;
  created_at: string;
  chat_rooms: { name: string } | null;
}

export async function searchMessages(supabase: SupabaseClient, query: string): Promise<ChatSearchResult[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, room_id, content, created_at, chat_rooms(name)')
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as unknown as SearchRow[]).map((row) => ({
    messageId: row.id,
    roomId: row.room_id,
    roomName: row.chat_rooms?.name ?? '-',
    content: row.content ?? '',
    createdAt: row.created_at,
  }));
}
