'use client';

import { useState, type FormEvent } from 'react';
import type { Staff } from '@/lib/types';
import type { ClinicEvent } from '@/lib/supabase/clinicEvents';
import type { CalendarLeave } from '@/lib/homeCalendar';
import { holidayName } from '@/lib/publicHolidays';
import type { WorkBoard, WorkItem, WorkKind } from '@/lib/workItems';
import { WorkItemsPanel } from './WorkItemsPanel';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface HomeDayPanelProps {
  date: string;
  today: string;
  isOwner: boolean;
  events: ClinicEvent[];
  leaves: CalendarLeave[];
  board: WorkBoard;
  staffList: Staff[];
  myId: string | null;
  onAddWork: (input: { kind: WorkKind; content: string; assigneeIds: string[] }) => Promise<void>;
  onToggleWork: (item: WorkItem) => void;
  onRemoveWork: (item: WorkItem) => void;
  onAddEvent: (title: string, startDate: string, endDate: string) => Promise<void>;
  onDeleteEvent: (event: ClinicEvent) => void;
}

function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

// 달력에서 고른 날짜의 이벤트·연차와 할 일·오더·전달사항(WorkItemsPanel)을 보여주고, 그 날짜로 새로 올린다
// (원장 요청, 2026-10-03 — 날짜별 할 일과 할 일·전달사항을 하나로 묶음). 이벤트 기간 등록은 원장에게만 보인다.
export function HomeDayPanel(props: HomeDayPanelProps) {
  const { date, today, isOwner, events, leaves, board, staffList, myId } = props;
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState(date);
  const [eventEnd, setEventEnd] = useState(date);
  const [savingEvent, setSavingEvent] = useState(false);

  const openCount = board.received.length + board.mine.filter((i) => !i.doneAt).length;

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
        {openCount > 0 && (
          <span className="muted-text" style={{ fontSize: 12 }}>
            처리할 것 {openCount}건
          </span>
        )}
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

      <WorkItemsPanel
        date={date}
        today={today}
        board={board}
        staffList={staffList}
        myId={myId}
        onAdd={props.onAddWork}
        onToggleDone={props.onToggleWork}
        onRemove={props.onRemoveWork}
      />

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
