'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { confirmDialog } from '@/lib/confirmDialog';
import { todayKst } from '@/lib/kst';
import { createWorkItems, deleteWorkItem, listWorkItems, setWorkItemDone } from '@/lib/supabase/workItems';
import { actionLabel, buildWorkBoard, doneLabel, formatKstTime, isOverdue, kindLabel, type WorkItem, type WorkKind } from '@/lib/workItems';
import type { Staff } from '@/lib/types';

const REFRESH_MS = 60_000;

const KIND_TABS: { value: WorkKind; label: string }[] = [
  { value: 'self', label: '내 할 일' },
  { value: 'order', label: '오더' },
  { value: 'notice', label: '전달사항' },
];

const smallButton = { fontSize: 12, padding: '3px 10px', fontWeight: 700 } as const;
const quietButton = { border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 14, padding: '0 4px' } as const;

// 홈 달력 아래 "할 일·전달사항" — 내 할 일은 올려 두고 완료만 누르고, 다른 직원에게 오더·전달사항을 보내면 받은 사람이
// 완료·숙지를 눌렀을 때 보낸 사람도 같은 화면에서 확인한다(원장 요청, 2026-10-03). 보낸 사람과 받은 사람만 볼 수 있다.
export function HomeWorkBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [kind, setKind] = useState<WorkKind>('self');
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [showDoneReceived, setShowDoneReceived] = useState(false);
  const busy = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const next = await listWorkItems(supabase);
      setItems(next);
      setNowMs(Date.now());
      setError('');
    } catch {
      setError('할 일을 불러오지 못했어요.');
    } finally {
      setLoaded(true);
    }
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
    supabase
      .from('staff')
      .select('id, name, role')
      .eq('status', 'approved')
      .then(({ data }) => setStaffList((data ?? []) as Staff[]));
    refresh();
    // 다른 직원이 보낸 오더·완료 표시가 늦지 않게 1분마다, 그리고 이 탭으로 돌아올 때 다시 읽는다.
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [supabase, refresh]);

  const today = todayKst();
  const board = useMemo(() => buildWorkBoard(items, myId, nowMs), [items, myId, nowMs]);
  const others = staffList.filter((s) => s.id !== myId);
  const nameOf = (id: string) => staffList.find((s) => s.id === id)?.name ?? '직원';
  const canAdd = text.trim() !== '' && (kind === 'self' || recipients.length > 0) && !adding;

  function pickKind(next: WorkKind) {
    setKind(next);
    if (next === 'self') setRecipients([]);
  }

  function toggleRecipient(id: string) {
    setRecipients((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!canAdd || !myId) return;
    setAdding(true);
    setError('');
    try {
      await createWorkItems(supabase, {
        kind,
        content: text.trim(),
        createdBy: myId,
        assigneeIds: kind === 'self' ? [myId] : recipients,
        dueDate: due || null,
      });
      setText('');
      setDue('');
      setRecipients([]);
      await refresh();
    } catch {
      setError('추가하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setAdding(false);
    }
  }

  async function toggleDone(item: WorkItem) {
    if (busy.current.has(item.id)) return;
    busy.current.add(item.id);
    const done = !item.doneAt;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, doneAt: done ? new Date().toISOString() : null } : i)));
    try {
      await setWorkItemDone(supabase, item.id, done);
    } catch {
      setError('저장하지 못했어요.');
      await refresh();
    } finally {
      busy.current.delete(item.id);
    }
  }

  async function remove(item: WorkItem) {
    const label = item.kind === 'self' ? '삭제' : item.doneAt ? '삭제' : '취소';
    if (!(await confirmDialog(`"${item.content}" 을(를) ${label}할까요?`, { confirmLabel: label }))) return;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await deleteWorkItem(supabase, item.id);
    } catch {
      setError('삭제하지 못했어요.');
      await refresh();
    }
  }

  const dueBadge = (item: WorkItem) =>
    item.dueDate ? (
      <span style={{ fontSize: 11, color: isOverdue(item, today) ? 'var(--color-error)' : 'var(--color-muted)', fontWeight: isOverdue(item, today) ? 700 : 400 }}>
        {item.dueDate.slice(5).replace('-', '/')}까지
      </span>
    ) : null;

  const sectionTitle = (title: string, count: number, color?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '12px 0 4px', fontSize: 12, fontWeight: 700, color: color ?? 'var(--color-muted)' }}>
      {title}
      {count > 0 && <span style={{ fontWeight: 600 }}>{count}</span>}
    </div>
  );

  const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-line)' } as const;
  const hasAnything = board.received.length + board.receivedDone.length + board.mine.length + board.sent.length > 0;

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>📌 할 일 · 전달사항</span>
        {board.received.length > 0 && (
          <span style={{ background: 'var(--color-error)', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 7px' }}>
            받은 {board.received.length}
          </span>
        )}
      </div>

      <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div role="tablist" style={{ display: 'flex', gap: 4 }}>
          {KIND_TABS.map((tab) => {
            const on = kind === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => pickKind(tab.value)}
                style={{
                  flex: 1,
                  fontSize: 12,
                  padding: '4px 0',
                  fontWeight: on ? 700 : 500,
                  borderRadius: 6,
                  border: `1px solid ${on ? 'var(--color-brand-b)' : 'var(--color-line)'}`,
                  background: on ? 'var(--color-brand-b)' : 'var(--color-surface)',
                  color: on ? '#fff' : 'var(--color-ink)',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'self' ? '내가 해야 할 일' : kind === 'order' ? '부탁할 일(오더) 내용' : '전달할 내용'}
          className="input-field"
          style={{ padding: '6px 8px', fontSize: 13 }}
        />
        {kind !== 'self' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            <span className="muted-text" style={{ fontSize: 11 }}>받는 사람</span>
            {others.map((s) => {
              const on = recipients.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleRecipient(s.id)}
                  style={{
                    fontSize: 12,
                    padding: '2px 9px',
                    borderRadius: 999,
                    border: `1px solid ${on ? 'var(--color-brand-b)' : 'var(--color-line)'}`,
                    background: on ? 'var(--color-brand-b)' : 'var(--color-surface)',
                    color: on ? '#fff' : 'var(--color-ink)',
                    fontWeight: on ? 700 : 500,
                  }}
                >
                  {s.name}
                </button>
              );
            })}
            {others.length > 1 && (
              <button
                type="button"
                onClick={() => setRecipients(recipients.length === others.length ? [] : others.map((s) => s.id))}
                style={{ ...quietButton, fontSize: 11, textDecoration: 'underline' }}
              >
                {recipients.length === others.length ? '선택 해제' : '전체 선택'}
              </button>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <label className="muted-text" style={{ fontSize: 11 }}>
            마감(선택)
          </label>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input-field" style={{ padding: '4px 6px', fontSize: 12, width: 130 }} />
          <button type="submit" className="btn-primary" disabled={!canAdd} style={{ ...smallButton, marginLeft: 'auto' }}>
            {kind === 'self' ? '추가' : '보내기'}
          </button>
        </div>
      </form>

      {error && <p className="error-text" style={{ fontSize: 12, marginTop: 8 }}>{error}</p>}
      {!loaded && <p className="muted-text" style={{ fontSize: 12, marginTop: 8 }}>불러오는 중...</p>}
      {loaded && !hasAnything && !error && <p className="muted-text" style={{ fontSize: 12, marginTop: 12 }}>올라온 할 일이나 전달사항이 없어요.</p>}

      {board.received.length > 0 && (
        <>
          {sectionTitle('📥 받은 오더·전달', board.received.length, 'var(--color-error)')}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {board.received.map((item) => (
              <li key={item.id} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, wordBreak: 'break-word' }}>{item.content}</div>
                  <div className="muted-text" style={{ fontSize: 11, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span>
                      {nameOf(item.createdBy)} · {kindLabel(item.kind)} · {formatKstTime(item.createdAt)}
                    </span>
                    {dueBadge(item)}
                  </div>
                </div>
                <button type="button" className="btn-primary" onClick={() => toggleDone(item)} style={smallButton}>
                  {actionLabel(item.kind)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {board.receivedDone.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <button type="button" onClick={() => setShowDoneReceived((v) => !v)} style={{ ...quietButton, fontSize: 11, padding: 0 }}>
            {showDoneReceived ? '▾' : '▸'} 받아서 끝낸 {board.receivedDone.length}건
          </button>
          {showDoneReceived && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
              {board.receivedDone.map((item) => (
                <li key={item.id} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--color-muted)', textDecoration: 'line-through', wordBreak: 'break-word' }}>{item.content}</div>
                    <div className="muted-text" style={{ fontSize: 11 }}>
                      {nameOf(item.createdBy)} · {doneLabel(item.kind)} {item.doneAt ? formatKstTime(item.doneAt) : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => toggleDone(item)} style={{ ...quietButton, fontSize: 11 }}>
                    되돌리기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {board.mine.length > 0 && (
        <>
          {sectionTitle('✅ 내 할 일', board.mine.filter((i) => !i.doneAt).length)}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {board.mine.map((item) => (
              <li key={item.id} style={rowStyle}>
                <input type="checkbox" checked={!!item.doneAt} onChange={() => toggleDone(item)} aria-label={`${item.content} 완료`} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    wordBreak: 'break-word',
                    textDecoration: item.doneAt ? 'line-through' : 'none',
                    color: item.doneAt ? 'var(--color-muted)' : 'var(--color-ink)',
                  }}
                >
                  {item.content}
                </span>
                {dueBadge(item)}
                <button type="button" onClick={() => remove(item)} aria-label="삭제" style={quietButton}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {board.sent.length > 0 && (
        <>
          {sectionTitle('📤 내가 보낸 것', board.sent.filter((i) => !i.doneAt).length)}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {board.sent.map((item) => (
              <li key={item.id} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, wordBreak: 'break-word', color: item.doneAt ? 'var(--color-muted)' : 'var(--color-ink)' }}>{item.content}</div>
                  <div className="muted-text" style={{ fontSize: 11, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span>
                      → {nameOf(item.assigneeId)} · {kindLabel(item.kind)}
                    </span>
                    {dueBadge(item)}
                  </div>
                </div>
                {item.doneAt ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-green)', whiteSpace: 'nowrap' }}>
                    ✔ {doneLabel(item.kind)} {formatKstTime(item.doneAt)}
                  </span>
                ) : (
                  <span className="muted-text" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                    {item.kind === 'notice' ? '숙지 대기' : '완료 대기'}
                  </span>
                )}
                <button type="button" onClick={() => remove(item)} aria-label={item.doneAt ? '삭제' : '취소'} style={quietButton}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
