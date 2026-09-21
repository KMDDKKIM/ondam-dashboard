'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { listTodos, createTodo, setTodoDone, deleteTodo } from '@/lib/supabase/todos';
import { visibleTodos } from '@/lib/todoVisibility';
import { todayKst } from '@/lib/kst';
import { confirmDialog } from '@/lib/confirmDialog';
import type { Staff, Todo } from '@/lib/types';

// 목록 보기 기준: '' = 전체, 'me' = 내 것, 그 외 = 그 직원 id. 처음 화면은 '전체 보기'이고(담당자 없는 할 일이 숨지 않게), 고른 값은 이 브라우저에 기억한다.
const FILTER_KEY = 'todoChecklist.assigneeFilter';
const MINE = 'me';

function readSavedFilter(): string | null {
  try {
    return window.localStorage.getItem(FILTER_KEY);
  } catch {
    return null;
  }
}

function saveFilter(value: string) {
  try {
    window.localStorage.setItem(FILTER_KEY, value);
  } catch {
    // 저장이 막힌 브라우저에서는 기억만 못 할 뿐 화면은 그대로 동작한다.
  }
}

function TodoSkeleton() {
  return (
    <div className="card" style={{ padding: 20 }} aria-busy="true" aria-label="할 일 불러오는 중">
      <div className="skeleton" style={{ height: 18, width: 110, marginBottom: 16 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--color-line)' }}>
          <div className="skeleton" style={{ height: 14, width: 14 }} />
          <div className="skeleton" style={{ height: 14, flex: 1, maxWidth: 260 - i * 40 }} />
        </div>
      ))}
    </div>
  );
}

export function TodoChecklist() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newText, setNewText] = useState('');
  const [newDueDate, setNewDueDate] = useState(todayKst());
  const [newAssignee, setNewAssignee] = useState('');

  const supabase = createClient();
  const today = todayKst();

  // 처음 한 번만 자리표시(스켈레톤)를 보이고, 다시 불러올 때는 화면을 그대로 둔다.
  async function load() {
    setError('');
    try {
      const [todoRows, staffResult, userResult] = await Promise.all([
        listTodos(supabase),
        supabase.from('staff').select('id, name, role').eq('status', 'approved'),
        supabase.auth.getUser(),
      ]);
      setTodos(todoRows);
      setStaffList((staffResult.data ?? []) as Staff[]);
      setMyId(userResult.data.user?.id ?? null);
    } catch {
      setError('불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const saved = readSavedFilter();
    if (saved !== null) setAssigneeFilter(saved);
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

  async function remove(todo: Todo) {
    const id = todo.id;
    // 실수로 × 를 눌러도 바로 지워지지 않게 먼저 물어본다.
    if (!(await confirmDialog(`"${todo.text}" 을(를) 삭제할까요?`, { confirmLabel: '삭제' }))) return;
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

  function changeFilter(value: string) {
    setAssigneeFilter(value);
    saveFilter(value);
  }

  // '내 것'인데 내 계정을 아직 못 알아냈으면(또는 저장된 직원이 이제 없으면) 전체로 보여준다.
  const filterId = assigneeFilter === MINE ? myId : staffList.some((s) => s.id === assigneeFilter) ? assigneeFilter : null;
  const selectValue = assigneeFilter === MINE || staffList.some((s) => s.id === assigneeFilter) ? assigneeFilter : '';
  const visible = visibleTodos(todos, today, filterId);
  const doneCount = visible.filter((t) => t.done).length;
  // 특정 사람(내 것 포함)만 보고 있을 때, 담당자가 없어서 목록에서 빠진 할 일 수.
  const hiddenUnassigned = filterId ? visibleTodos(todos, today, null).filter((t) => !t.assigneeStaffId).length : 0;

  if (loading) return <TodoSkeleton />;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <span style={{ color: 'var(--color-green)' }}>✅</span>
          <span>오늘 할 일</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={selectValue}
            onChange={(e) => changeFilter(e.target.value)}
            className="input-field"
            style={{ padding: '4px 8px', fontSize: 12, width: 120 }}
          >
            <option value={MINE}>내 것</option>
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

      {hiddenUnassigned > 0 && (
        <p className="muted-text" style={{ fontSize: 12, marginBottom: 8 }}>
          담당자 없는 할 일 {hiddenUnassigned}건은 전체 보기에서 볼 수 있어요
        </p>
      )}

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
                onClick={() => remove(todo)}
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
