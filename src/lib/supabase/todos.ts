import type { SupabaseClient } from '@supabase/supabase-js';
import type { Todo } from '@/lib/types';

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

// 오늘 화면에 보여줄 후보를 넉넉히 가져온다(지난 미완료 건까지 자동으로 계속
// 뜨게 하려고 done 여부와 무관하게 최근 것 위주로 가져오고, 화면에서 걸러낸다).
export async function listTodos(supabase: SupabaseClient): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .order('due_date', { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data as TodoRow[]).map(rowToTodo);
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

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function setTodoDone(supabase: SupabaseClient, id: string, done: boolean): Promise<void> {
  const { error } = await supabase
    .from('todos')
    .update({ done, done_at: done ? todayISO() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTodo(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('todos').delete().eq('id', id);
  if (error) throw error;
}
