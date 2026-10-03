'use client';

import { useState, type FormEvent } from 'react';
import type { Staff } from '@/lib/types';
import { actionLabel, doneLabel, formatKstTime, isOverdue, kindLabel, type WorkBoard, type WorkItem, type WorkKind } from '@/lib/workItems';

// 화면에서는 두 가지 — 할 일(나에게)과 요청·전달사항(다른 직원에게). 요청·전달사항은 DB의 order로 저장한다.
const KIND_TABS: { value: WorkKind; label: string }[] = [
  { value: 'self', label: '할 일' },
  { value: 'order', label: '요청·전달사항' },
];

const smallButton = { fontSize: 12, padding: '3px 10px', fontWeight: 700 } as const;
const quietButton = { border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 14, padding: '0 4px' } as const;
const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-line)' } as const;

interface Props {
  /** 달력에서 고른 날짜 — 새로 올리는 항목이 이 날짜에 놓인다. */
  date: string;
  today: string;
  board: WorkBoard;
  staffList: Staff[];
  myId: string | null;
  onAdd: (input: { kind: WorkKind; content: string; assigneeIds: string[] }) => Promise<void>;
  onToggleDone: (item: WorkItem) => void;
  onRemove: (item: WorkItem) => void;
}

// 달력에서 고른 날짜의 할 일·요청전달사항. 할 일은 올려 두고 체크만 하고, 다른 직원에게 보낸 요청·전달사항은
// 받은 사람이 "확인"을 누르면 보낸 사람 화면에 시각과 함께 뜬다(원장 요청, 2026-10-03).
export function WorkItemsPanel({ date, today, board, staffList, myId, onAdd, onToggleDone, onRemove }: Props) {
  const [kind, setKind] = useState<WorkKind>('self');
  const [text, setText] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [showDoneReceived, setShowDoneReceived] = useState(false);

  const others = staffList.filter((s) => s.id !== myId);
  const nameOf = (id: string) => staffList.find((s) => s.id === id)?.name ?? '직원';
  const canAdd = text.trim() !== '' && (kind === 'self' || recipients.length > 0) && !adding;
  const isEmpty = board.received.length + board.receivedDone.length + board.mine.length + board.sent.length === 0;

  function pickKind(next: WorkKind) {
    setKind(next);
    if (next === 'self') setRecipients([]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setAdding(true);
    try {
      await onAdd({ kind, content: text.trim(), assigneeIds: kind === 'self' ? [] : recipients });
      setText('');
      setRecipients([]);
    } finally {
      setAdding(false);
    }
  }

  // 올린 날짜가 이 날짜와 다르면(밀려서 따라온 것) 원래 날짜를 알려 준다.
  const carriedBadge = (item: WorkItem) =>
    item.dueDate && item.dueDate !== date ? (
      <span style={{ fontSize: 11, fontWeight: isOverdue(item, today) ? 700 : 400, color: isOverdue(item, today) ? 'var(--color-error)' : 'var(--color-muted)' }}>
        {item.dueDate.slice(5).replace('-', '/')} 예정
      </span>
    ) : null;

  const sectionTitle = (title: string, count: number, color?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0 2px', fontSize: 12, fontWeight: 700, color: color ?? 'var(--color-muted)' }}>
      {title}
      {count > 0 && <span style={{ fontWeight: 600 }}>{count}</span>}
    </div>
  );

  return (
    <div>
      {isEmpty && (
        <p className="muted-text" style={{ margin: '0 0 8px', fontSize: 13 }}>
          이 날 할 일이나 요청·전달사항이 없어요.
        </p>
      )}

      {board.received.length > 0 && (
        <>
          {sectionTitle('📥 받은 요청·전달', board.received.length, 'var(--color-error)')}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {board.received.map((item) => (
              <li key={item.id} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, wordBreak: 'break-word' }}>{item.content}</div>
                  <div className="muted-text" style={{ fontSize: 11, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span>
                      {nameOf(item.createdBy)} · {kindLabel(item.kind)} · {formatKstTime(item.createdAt)}
                    </span>
                    {carriedBadge(item)}
                  </div>
                </div>
                <button type="button" className="btn-primary" onClick={() => onToggleDone(item)} style={smallButton}>
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
                  <button type="button" onClick={() => onToggleDone(item)} style={{ ...quietButton, fontSize: 11 }}>
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
          {sectionTitle('✅ 할 일', board.mine.filter((i) => !i.doneAt).length)}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {board.mine.map((item) => (
              <li key={item.id} style={rowStyle}>
                <input type="checkbox" checked={!!item.doneAt} onChange={() => onToggleDone(item)} aria-label={`${item.content} 완료`} />
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
                {carriedBadge(item)}
                <button type="button" onClick={() => onRemove(item)} aria-label="삭제" style={quietButton}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {board.sent.length > 0 && (
        <>
          {sectionTitle('📤 보낸 요청·전달', board.sent.filter((i) => !i.doneAt).length)}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {board.sent.map((item) => (
              <li key={item.id} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, wordBreak: 'break-word', color: item.doneAt ? 'var(--color-muted)' : 'var(--color-ink)' }}>{item.content}</div>
                  <div className="muted-text" style={{ fontSize: 11, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span>
                      → {nameOf(item.assigneeId)} · {kindLabel(item.kind)}
                    </span>
                    {carriedBadge(item)}
                  </div>
                </div>
                {item.doneAt ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-green)', whiteSpace: 'nowrap' }}>
                    ✔ {doneLabel(item.kind)} {formatKstTime(item.doneAt)}
                  </span>
                ) : (
                  <span className="muted-text" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                    확인 대기
                  </span>
                )}
                <button type="button" onClick={() => onRemove(item)} aria-label={item.doneAt ? '삭제' : '취소'} style={quietButton}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
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
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={kind === 'self' ? '내가 해야 할 일' : '요청하거나 전달할 내용'}
            className="input-field"
            style={{ flex: 1, minWidth: 0, padding: '6px 8px', fontSize: 13 }}
          />
          <button type="submit" className="btn-primary" disabled={!canAdd} style={smallButton}>
            {kind === 'self' ? '추가' : '보내기'}
          </button>
        </div>
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
                  onClick={() => setRecipients((prev) => (prev.includes(s.id) ? prev.filter((r) => r !== s.id) : [...prev, s.id]))}
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
      </form>
    </div>
  );
}
