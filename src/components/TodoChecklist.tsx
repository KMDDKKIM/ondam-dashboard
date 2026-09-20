'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { listTodos, createTodo, setTodoDone, deleteTodo } from '@/lib/supabase/todos';
import { visibleTodos } from '@/lib/todoVisibility';
import type { Staff, Todo } from '@/lib/types';

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function TodoChecklist() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newText, setNewText] = useState('');
  const [newDueDate, setNewDueDate] = useState(todayISO());
  const [newAssignee, setNewAssignee] = useState('');

  const supabase = createClient();
  const today = todayISO();

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [todoRows, staffResult] = await Promise.all([
        listTodos(supabase),
        supabase.from('staff').select('id, name, role').eq('status', 'approved'),
      ]);
      setTodos(todoRows);
      setStaffList((staffResult.data ?? []) as Staff[]);
    } catch {
      setError('불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function staffName(id: string | null): string {
    if (!id) return '';
    return staffList.find((s) => s.id === id)?.name ?? '';
  }

  async function toggle(todo: Todo) {
    const done = !todo.done;
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done, doneAt: done ? today : null } : t)));
    try {
      await setTodoDone(supabase, todo.id, done);
    } catch {
      setError('저장에 실패했습니다.');
      await load();
    }
  }

  async function remove(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTodo(supabase, id);
    } catch {
      setError('삭제에 실패했습니다.');
      await load();
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createTodo(supabase, {
        text: newText.trim(),
        dueDate: newDueDate || today,
        assigneeStaffId: newAssignee || null,
        createdBy: user?.id ?? null,
      });
      setNewText('');
      setNewDueDate(today);
      setNewAssignee('');
      await load();
    } catch {
      setError('추가에 실패했습니다.');
    }
  }

  const visible = visibleTodos(todos, today, assigneeFilter || null);
  const doneCount = visible.filter((t) => t.done).length;

  if (loading) return null;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <span style={{ color: 'var(--color-green)' }}>✅</span>
          <span>오늘 할 일</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="input-field"
            style={{ padding: '4px 8px', fontSize: 12, width: 120 }}
          >
            <option value="">전체 보기</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="muted-text">
            {doneCount}/{visible.length} 완료
          </span>
        </div>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 8 }}>{error}</p>}

      {visible.length === 0 ? (
        <p className="muted-text" style={{ marginBottom: 12 }}>
          할 일이 없어요.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {visible.map((todo) => (
            <li
              key={todo.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 0',
                borderBottom: '1px solid var(--color-line)',
              }}
            >
              <input type="checkbox" checked={todo.done} onChange={() => toggle(todo)} />
              <span
                style={{
                  flex: 1,
                  fontSize: 14,
                  textDecoration: todo.done ? 'line-through' : 'none',
                  color: todo.done ? 'var(--color-muted)' : 'var(--color-ink)',
                }}
              >
                {todo.text}
              </span>
              {todo.dueDate < today && !todo.done && (
                <span style={{ fontSize: 11, color: 'var(--color-error)' }}>{todo.dueDate} 예정</span>
              )}
              {staffName(todo.assigneeStaffId) && (
                <span className="muted-text" style={{ fontSize: 11 }}>
                  {staffName(todo.assigneeStaffId)}
                </span>
              )}
              <button
                onClick={() => remove(todo.id)}
                style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 14 }}
                aria-label="삭제"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addItem} style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="할 일 추가"
          className="input-field"
          style={{ flex: '1 1 160px' }}
        />
        <input
          type="date"
          value={newDueDate}
          onChange={(e) => setNewDueDate(e.target.value)}
          className="input-field"
          style={{ width: 150 }}
        />
        <select
          value={newAssignee}
          onChange={(e) => setNewAssignee(e.target.value)}
          className="input-field"
          style={{ width: 120 }}
        >
          <option value="">담당자 없음</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
          추가
        </button>
      </form>
    </div>
  );
}
