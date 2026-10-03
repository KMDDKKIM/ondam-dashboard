'use client';

import { useState, type FormEvent } from 'react';
import type { Staff, Todo } from '@/lib/types';
import type { ClinicEvent } from '@/lib/supabase/clinicEvents';
import type { CalendarLeave } from '@/lib/homeCalendar';
import { holidayName } from '@/lib/publicHolidays';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 목록 보기 기준: '' = 전체, 'me' = 내 것, 그 외 = 그 직원 id (TodoChecklist 때부터 쓰던 값과 같다).
export const MINE = 'me';

interface HomeDayPanelProps {
  date: string;
  today: string;
  isOwner: boolean;
  events: ClinicEvent[];
  leaves: CalendarLeave[];
  todos: Todo[];
  staffList: Staff[];
  assigneeFilter: string;
  onChangeFilter: (value: string) => void;
  onToggleTodo: (todo: Todo) => void;
  onDeleteTodo: (todo: Todo) => void;
  onAddTodo: (text: string, assigneeStaffId: string | null) => Promise<void>;
  onAddEvent: (title: string, startDate: string, endDate: string) => Promise<void>;
  onDeleteEvent: (event: ClinicEvent) => void;
}

function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

// 달력에서 고른 날짜의 이벤트·연차·할 일을 보여주고, 그 날짜로 할 일을 추가한다(원장 요청,
// 2026-10-02 — 달력과 "오늘 할 일"을 하나로 묶음). 이벤트 기간 등록은 원장에게만 보인다.
export function HomeDayPanel(props: HomeDayPanelProps) {
  const { date, today, isOwner, events, leaves, todos, staffList, assigneeFilter, onChangeFilter } = props;
  const [newText, setNewText] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [adding, setAdding] = useState(false);

  const [showEventForm, setShowEventForm] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState(date);
  const [eventEnd, setEventEnd] = useState(date);
  const [savingEvent, setSavingEvent] = useState(false);

  const staffName = (id: string | null) => (id ? (staffList.find((s) => s.id === id)?.name ?? '') : '');
  const doneCount = todos.filter((t) => t.done).length;
  const selectValue = assigneeFilter === MINE || staffList.some((s) => s.id === assigneeFilter) ? assigneeFilter : '';

  async function addTodo(e: FormEvent) {
    e.preventDefault();
    if (!newText.trim()) return;
    setAdding(true);
    try {
      await props.onAddTodo(newText.trim(), newAssignee || null);
      setNewText('');
      setNewAssignee('');
    } finally {
      setAdding(false);
    }
  }

  async function addEvent(e: FormEvent) {
    e.preventDefault();
    if (!eventTitle.trim() || eventEnd < eventStart) return;
    setSavingEvent(true);
    try {
      await props.onAddEvent(eventTitle.trim(), eventStart, eventEnd);
      setEventTitle('');
    } finally {
      setSavingEvent(false);
    }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <span style={{ color: 'var(--color-green)' }}>✅</span>
          <span>{dateLabel(date)}</span>
          {date === today && <span className="muted-text" style={{ fontSize: 11, fontWeight: 600 }}>오늘</span>}
          {holidayName(date) && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-error)' }}>{holidayName(date)}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={selectValue}
            onChange={(e) => onChangeFilter(e.target.value)}
            className="input-field"
            style={{ padding: '3px 6px', fontSize: 12, width: 100 }}
          >
            <option value={MINE}>내 것</option>
            <option value="">전체 보기</option>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="muted-text" style={{ fontSize: 12 }}>
            {doneCount}/{todos.length} 완료
          </span>
        </div>
      </div>

      {(events.length > 0 || leaves.length > 0) && (
        <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          {events.map((ev) => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--color-orange)' }}>●</span>
              <span style={{ fontWeight: 600 }}>{ev.title}</span>
              <span className="muted-text" style={{ fontSize: 11 }}>
                {ev.startDate === ev.endDate ? '' : `${ev.startDate.slice(5)} ~ ${ev.endDate.slice(5)}`}
              </span>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => props.onDeleteEvent(ev)}
                  aria-label="이벤트 삭제"
                  style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 13, marginLeft: 'auto' }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {leaves.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--color-blue)' }}>●</span>
              <span className="muted-text">연차</span>
              <span style={{ fontWeight: 600 }}>
                {leaves.map((l) => `${l.staffName}${l.halfDay ? (l.halfDay === 'am' ? '(오전)' : '(오후)') : ''}${l.status === 'pending' ? ' (승인 대기)' : ''}`).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {todos.length === 0 ? (
        <p className="muted-text" style={{ margin: '0 0 8px', fontSize: 13 }}>
          이 날 할 일이 없어요.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {todos.map((todo) => (
            <li key={todo.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--color-line)' }}>
              <input type="checkbox" checked={todo.done} onChange={() => props.onToggleTodo(todo)} />
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  textDecoration: todo.done ? 'line-through' : 'none',
                  color: todo.done ? 'var(--color-muted)' : 'var(--color-ink)',
                }}
              >
                {todo.text}
              </span>
              {todo.dueDate < today && !todo.done && date === today && (
                <span style={{ fontSize: 11, color: 'var(--color-error)' }}>{todo.dueDate} 예정</span>
              )}
              {staffName(todo.assigneeStaffId) && (
                <span className="muted-text" style={{ fontSize: 11 }}>
                  {staffName(todo.assigneeStaffId)}
                </span>
              )}
              <button
                type="button"
                onClick={() => props.onDeleteTodo(todo)}
                aria-label="삭제"
                style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 14 }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addTodo} style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder={`${dateLabel(date)} 할 일 추가`}
          className="input-field"
          style={{ flex: '1 1 140px', padding: '5px 8px', fontSize: 13 }}
        />
        <select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} className="input-field" style={{ width: 100, padding: '5px 6px', fontSize: 12 }}>
          <option value="">담당자 없음</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary" disabled={adding || !newText.trim()} style={{ padding: '5px 12px', fontSize: 12 }}>
          추가
        </button>
      </form>

      {isOwner && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => {
              setEventStart(date);
              setEventEnd(date);
              setShowEventForm((v) => !v);
            }}
            style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 12, fontWeight: 600, padding: 0 }}
          >
            {showEventForm ? '▾' : '▸'} 이벤트 기간 등록 (원장)
          </button>
          {showEventForm && (
            <form onSubmit={addEvent} style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="이벤트 이름"
                className="input-field"
                style={{ flex: '1 1 110px', padding: '5px 8px', fontSize: 12 }}
              />
              <input type="date" value={eventStart} onChange={(e) => setEventStart(e.target.value)} className="input-field" style={{ width: 128, padding: '5px 6px', fontSize: 12 }} />
              <span className="muted-text">~</span>
              <input type="date" value={eventEnd} onChange={(e) => setEventEnd(e.target.value)} className="input-field" style={{ width: 128, padding: '5px 6px', fontSize: 12 }} />
              <button type="submit" className="btn-primary" disabled={savingEvent || !eventTitle.trim() || eventEnd < eventStart} style={{ padding: '5px 12px', fontSize: 12 }}>
                등록
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
