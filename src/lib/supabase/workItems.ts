import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { DONE_VISIBLE_DAYS, type WorkItem, type WorkKind } from '@/lib/workItems';

interface Row {
  id: string;
  kind: WorkKind;
  content: string;
  created_by: string;
  assignee_id: string;
  due_date: string | null;
  deadline?: string | null;
  done_at: string | null;
  created_at: string;
}

function rowToItem(r: Row): WorkItem {
  return { id: r.id, kind: r.kind, content: r.content, createdBy: r.created_by, assigneeId: r.assignee_id, dueDate: r.due_date, deadline: r.deadline ?? null, doneAt: r.done_at, createdAt: r.created_at };
}

// 내가 보낸 것·받은 것(RLS가 둘만 보게 막는다) 중 안 끝난 것 전부 + 최근에 끝낸 것.
export async function listWorkItems(supabase: SupabaseClient, nowMs: number = Date.now()): Promise<WorkItem[]> {
  const since = new Date(nowMs - DONE_VISIBLE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = await fetchAllPages<Row>(async (from, to) => {
    const { data, error, count } = await supabase
      .from('work_items')
      .select('*', { count: 'exact' })
      .or(`done_at.is.null,done_at.gte.${since}`)
      .order('created_at', { ascending: true })
      .order('id')
      .range(from, to);
    return { data: data as Row[] | null, error, count };
  });
  return rows.map(rowToItem);
}

export interface NewWorkItem {
  kind: WorkKind;
  content: string;
  createdBy: string;
  /** 받는 사람들 — 내 할 일(self)이면 나 하나. 사람마다 줄이 하나씩 생긴다. */
  assigneeIds: string[];
  /** 달력에서 올린 날짜 */
  dueDate: string | null;
  /** 마감기한(선택) */
  deadline?: string | null;
}

export async function createWorkItems(supabase: SupabaseClient, input: NewWorkItem): Promise<void> {
  const rows = input.assigneeIds.map((assigneeId) => ({
    kind: input.kind,
    content: input.content,
    created_by: input.createdBy,
    assignee_id: assigneeId,
    due_date: input.dueDate,
    // 마감기한 칸이 아직 없는 DB(마이그레이션 전)에 보내지 않도록 값이 있을 때만 넣는다.
    ...(input.deadline ? { deadline: input.deadline } : {}),
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('work_items').insert(rows);
  if (error) throw error;
}

export async function setWorkItemDone(supabase: SupabaseClient, id: string, done: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('work_items')
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('처리되지 않았습니다.');
}

// 삭제 정책(RLS)에 막히면 PostgREST 는 에러 없이 0행을 지운다 — 그 경우를 실패로 다룬다.
export async function deleteWorkItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('work_items').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제되지 않았습니다.');
}
