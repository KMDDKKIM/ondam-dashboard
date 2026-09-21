import type { SupabaseClient } from '@supabase/supabase-js';
import type { Todo } from '@/lib/types';
import { todayKst } from '@/lib/kst';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { completedWindowStart } from '@/lib/todoVisibility';

interface TodoRow {
  id: string;
  text: string;
  due_date: string;
  assignee_staff_id: string | null;
  done: boolean;
  done_at: string | null;
  created_by: string | null;
  created_at: string;
}

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    text: row.text,
    dueDate: row.due_date,
    assigneeStaffId: row.assignee_staff_id,
    done: row.done,
    doneAt: row.done_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// Supabase는 한 번에 주는 행 수에 상한이 있으므로, 전체 개수(count)만큼 다 받을 때까지 이어서 읽는다.
function fetchAllRows(
  run: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown; count: number | null }>,
): Promise<TodoRow[]> {
  return fetchAllPages<TodoRow>(async (from, to) => {
    const { data, error, count } = await run(from, to);
    return { data: data as TodoRow[] | null, error, count };
  });
}

// 오늘 화면에 보여줄 후보: 안 끝난 것은 예정일과 상관없이 전부, 끝난 것은 최근 7일치만.
// (예전에는 예정일 순 300건만 가져와서, 오래된 끝난 항목이 쌓이면 오늘 할 일이 밀려났다.)
export async function listTodos(supabase: SupabaseClient, today: string = todayKst()): Promise<Todo[]> {
  const since = completedWindowStart(today);
  const [open, done] = await Promise.all([
    fetchAllRows((a, b) =>
      supabase.from('todos').select('*', { count: 'exact' }).eq('done', false).order('due_date', { ascending: true }).order('id').range(a, b),
    ),
    fetchAllRows((a, b) =>
      supabase
        .from('todos')
        .select('*', { count: 'exact' })
        .eq('done', true)
        .gte('done_at', since)
        .order('due_date', { ascending: true })
        .order('id')
        .range(a, b),
    ),
  ]);
  return [...open, ...done].map(rowToTodo);
}

export interface NewTodo {
  text: string;
  dueDate: string;
  assigneeStaffId: string | null;
  createdBy: string | null;
}

export async function createTodo(supabase: SupabaseClient, input: NewTodo): Promise<void> {
  const { error } = await supabase.from('todos').insert({
    text: input.text,
    due_date: input.dueDate,
    assignee_staff_id: input.assigneeStaffId,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

export async function setTodoDone(supabase: SupabaseClient, id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from('todos')
    .update({ done, done_at: done ? todayKst() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTodo(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('todos').delete().eq('id', id);
  if (error) throw error;
}
