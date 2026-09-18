'use client';

import { useEffect, useState, type FormEvent } from 'react';

const DEFAULT_ITEMS = ['오늘 예약 엑셀 업로드하기', '마감 멘트 입력하기', '오늘 해피콜 대상 전화하기'];

function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `ondam-todo-${y}-${m}-${d}`;
}

export function TodoChecklist() {
  const [items, setItems] = useState<{ text: string; done: boolean }[]>(
    DEFAULT_ITEMS.map((text) => ({ text, done: false }))
  );
  const [newItem, setNewItem] = useState('');

  // 이 위젯은 화면마다 달라도 되는 개인 체크리스트라 브라우저 저장만 쓴다 —
  // 여러 직원이 공유해야 하는 데이터가 아니라서 Supabase까지는 필요 없다.
  // 날짜가 바뀌면 키가 자동으로 바뀌어 매일 새로 시작한다.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(todayKey());
      if (saved) setItems(JSON.parse(saved));
    } catch {
      // localStorage를 못 쓰는 환경이면 기본 항목으로 그냥 진행한다.
    }
  }, []);

  function persist(next: { text: string; done: boolean }[]) {
    setItems(next);
    try {
      localStorage.setItem(todayKey(), JSON.stringify(next));
    } catch {
      // 저장 실패해도 화면 상태는 계속 쓸 수 있게 둔다.
    }
  }

  function toggle(i: number) {
    persist(items.map((item, idx) => (idx === i ? { ...item, done: !item.done } : item)));
  }

  function remove(i: number) {
    persist(items.filter((_, idx) => idx !== i));
  }

  function addItem(e: FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    persist([...items, { text: newItem.trim(), done: false }]);
    setNewItem('');
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <span style={{ color: 'var(--color-green)' }}>✅</span>
          <span>오늘 할 일</span>
        </div>
        <span className="muted-text">
          {doneCount}/{items.length} 완료
        </span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 0',
              borderBottom: '1px solid var(--color-line)',
            }}
          >
            <input type="checkbox" checked={item.done} onChange={() => toggle(i)} />
            <span
              style={{
                flex: 1,
                fontSize: 14,
                textDecoration: item.done ? 'line-through' : 'none',
                color: item.done ? 'var(--color-muted)' : 'var(--color-ink)',
              }}
            >
              {item.text}
            </span>
            <button
              onClick={() => remove(i)}
              style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 14 }}
              aria-label="삭제"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={addItem} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="할 일 추가"
          className="input-field"
          style={{ flex: 1 }}
        />
        <button type="submit" className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
          추가
        </button>
      </form>
    </div>
  );
}
