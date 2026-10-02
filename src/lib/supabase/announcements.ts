import type { SupabaseClient } from '@supabase/supabase-js';

// 승인된 직원이면 누구나 쓰고 표시할 글을 고를 수 있다(todos.ts와 같은 공유 테이블 패턴) —
// RLS가 "승인된 직원이면 전부 허용"이라 일반 클라이언트로 그대로 호출한다.

export interface Announcement {
  id: string;
  content: string;
  isPinned: boolean;
  createdBy: string | null;
  createdAt: string;
}

interface AnnouncementRow {
  id: string;
  content: string;
  is_pinned: boolean;
  created_by: string | null;
  created_at: string;
}

function rowToAnnouncement(r: AnnouncementRow): Announcement {
  return { id: r.id, content: r.content, isPinned: r.is_pinned, createdBy: r.created_by, createdAt: r.created_at };
}

export async function listAnnouncements(supabase: SupabaseClient): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, content, is_pinned, created_by, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as AnnouncementRow[]).map(rowToAnnouncement);
}

export async function createAnnouncement(supabase: SupabaseClient, content: string, createdBy: string | null): Promise<void> {
  const { error } = await supabase.from('announcements').insert({ content, created_by: createdBy });
  if (error) throw error;
}

// 이 글만 표시(is_pinned=true)로 하고 나머지는 끈다 — 정확히 하나만 "표시 중"이 되게.
export async function pinAnnouncement(supabase: SupabaseClient, id: string): Promise<void> {
  const unpin = await supabase.from('announcements').update({ is_pinned: false }).neq('id', id).eq('is_pinned', true);
  if (unpin.error) throw unpin.error;
  const pin = await supabase.from('announcements').update({ is_pinned: true }).eq('id', id);
  if (pin.error) throw pin.error;
}

export async function deleteAnnouncement(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('announcements').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제할 수 없습니다.');
}
