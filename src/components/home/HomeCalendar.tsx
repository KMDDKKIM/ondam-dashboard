'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { confirmDialog } from '@/lib/confirmDialog';
import { currentMonthKst, todayKst } from '@/lib/kst';
import { monthGridWeeks } from '@/lib/leave';
import { holidayName } from '@/lib/publicHolidays';
import { assignEventLanes, buildDayEntries, eventSegment } from '@/lib/homeCalendar';
import { todosForDate } from '@/lib/todoVisibility';
import { listLeaveRequests, type LeaveRequest } from '@/lib/supabase/leave';
import { createClinicEvent, deleteClinicEvent, listClinicEvents, type ClinicEvent } from '@/lib/supabase/clinicEvents';
import { createTodo, deleteTodo, listTodos, setTodoDone } from '@/lib/supabase/todos';
import type { Staff, Todo } from '@/lib/types';
import { HomeDayPanel, MINE } from './HomeDayPanel';

const FILTER_KEY = 'todoChecklist.assigneeFilter';

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

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const LANE_HEIGHT = 14;

// 홈 달력 — 한의원 이벤트(기간 막대)와 승인된 연차를 보여주고, 날짜를 누르면 그 아래에 그날
// 할 일 목록이 뜬다(예전 "오늘 할 일" 카드를 여기로 묶음, 원장 요청 2026-10-02).
export function HomeCalendar({ isOwner }: { isOwner: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const today = todayKst();
  const [month, setMonth] = useState(currentMonthKst());
  const [selectedDate, setSelectedDate] = useState(today);
  const [events, setEvents] = useState<ClinicEvent[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const weeks = useMemo(() => monthGridWeeks(month), [month]);
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][6];

  const refreshCalendar = useCallback(async () => {
    try {
      const [eventRows, leaveRows] = await Promise.all([
        listClinicEvents(supabase, { from, to }),
        listLeaveRequests(supabase, { range: { from, to } }),
      ]);
      setEvents(eventRows);
      setLeaves(leaveRows.filter((l) => l.status !== 'rejected'));
    } catch {
      setError('달력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [supabase, from, to]);

  const refreshTodos = useCallback(async () => {
    try {
      setTodos(await listTodos(supabase));
    } catch {
      setError('할 일을 불러오지 못했습니다.');
    }
  }, [supabase]);

  useEffect(() => {
    refreshCalendar();
  }, [refreshCalendar]);

  useEffect(() => {
    const saved = readSavedFilter();
    if (saved !== null) setAssigneeFilter(saved);
    refreshTodos();
    supabase
      .from('staff')
      .select('id, name, role')
      .eq('status', 'approved')
      .then(({ data }) => setStaffList((data ?? []) as Staff[]));
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, [supabase, refreshTodos]);

  const lanes = useMemo(() => assignEventLanes(events), [events]);
  const dayEntries = useMemo(
    () =>
      buildDayEntries(
        events.map((e) => ({ id: e.id, title: e.title, startDate: e.startDate, endDate: e.endDate })),
        leaves.map((l) => ({
          id: l.id,
          staffName: l.staffName,
          startDate: l.startDate,
          endDate: l.endDate,
          halfDay: l.halfDay,
          status: l.status as 'pending' | 'approved',
        })),
        from,
        to
      ),
    [events, leaves, from, to]
  );

  // 주마다 필요한 이벤트 줄 수 — 그 주에 걸친 이벤트의 가장 큰 줄 번호 + 1.
  const weekLaneCounts = useMemo(
    () =>
      weeks.map((week) => {
        let max = -1;
        for (const e of events) {
          if (e.startDate <= week[6] && e.endDate >= week[0]) max = Math.max(max, lanes.get(e.id) ?? 0);
        }
        return max + 1;
      }),
    [weeks, events, lanes]
  );

  const filterId = assigneeFilter === MINE ? myId : staffList.some((s) => s.id === assigneeFilter) ? assigneeFilter : null;

  function openTodoCount(date: string): number {
    return todosForDate(todos, date, today, filterId).filter((t) => !t.done).length;
  }

  function changeFilter(value: string) {
    setAssigneeFilter(value);
    saveFilter(value);
  }

  async function toggleTodo(todo: Todo) {
    const done = !todo.done;
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, done, doneAt: done ? today : null } : t)));
    try {
      await setTodoDone(supabase, todo.id, done);
    } catch {
      setError('저장에 실패했습니다.');
      await refreshTodos();
    }
  }

  // × 를 빠르게 두 번 눌러도 확인창이 두 개 뜨지 않게, 확인창이 열려 있는 항목은 무시한다.
  const confirming = useRef(new Set<string>());

  async function removeTodo(todo: Todo) {
    if (confirming.current.has(todo.id)) return;
    confirming.current.add(todo.id);
    let ok = false;
    try {
      ok = await confirmDialog(`"${todo.text}" 을(를) 삭제할까요?`, { confirmLabel: '삭제' });
    } finally {
      confirming.current.delete(todo.id);
    }
    if (!ok) return;
    setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    try {
      await deleteTodo(supabase, todo.id);
    } catch {
      setError('삭제에 실패했습니다.');
      await refreshTodos();
    }
  }

  async function addTodo(text: string, assigneeStaffId: string | null) {
    setError('');
    try {
      await createTodo(supabase, { text, dueDate: selectedDate, assigneeStaffId, createdBy: myId });
      await refreshTodos();
    } catch {
      setError('추가에 실패했습니다.');
    }
  }

  async function addEvent(title: string, startDate: string, endDate: string) {
    setError('');
    try {
      await createClinicEvent(supabase, { title, startDate, endDate, createdBy: myId });
      await refreshCalendar();
    } catch {
      setError('이벤트를 추가하지 못했습니다.');
    }
  }

  async function removeEvent(event: ClinicEvent) {
    if (!(await confirmDialog(`"${event.title}" 이벤트를 삭제할까요?`, { confirmLabel: '삭제' }))) return;
    setError('');
    try {
      await deleteClinicEvent(supabase, event.id);
      await refreshCalendar();
    } catch {
      setError('삭제하지 못했습니다.');
    }
  }

  const selectedEntries = dayEntries.get(selectedDate);
  const selectedEvents = events.filter((e) => e.startDate <= selectedDate && e.endDate >= selectedDate);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 10 }}>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} style={{ border: 'none', background: 'transparent', fontSize: 14, cursor: 'pointer', padding: '2px 6px' }} aria-label="이전 달">
          ◀
        </button>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🗓️ {month}</span>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} style={{ border: 'none', background: 'transparent', fontSize: 14, cursor: 'pointer', padding: '2px 6px' }} aria-label="다음 달">
          ▶
        </button>
      </div>

      {error && <p className="error-text" style={{ fontSize: 12, marginBottom: 8 }}>{error}</p>}

      {loading ? (
        <p className="muted-text" style={{ fontSize: 12 }}>불러오는 중...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={label} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: i === 0 ? 'var(--color-error)' : 'var(--color-muted)' }}>
              {label}
            </div>
          ))}
          {weeks.flatMap((week, wi) =>
            week.map((date, col) => {
              const inMonth = date.slice(0, 7) === month;
              const isToday = date === today;
              const isSelected = date === selectedDate;
              const day = dayEntries.get(date);
              const pubHoliday = holidayName(date);
              const leaveChips = day?.leaves ?? [];
              const openTodos = openTodoCount(date);
              return (
                <div
                  key={date}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedDate(date)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedDate(date);
                    }
                  }}
                  style={{
                    minHeight: 58,
                    borderRadius: 6,
                    border: isSelected ? '2px solid var(--color-brand-b)' : '1px solid var(--color-line)',
                    margin: isSelected ? -1 : 0,
                    background: isSelected ? 'rgba(44, 143, 214, 0.10)' : inMonth ? 'var(--color-surface)' : 'var(--color-surface-2)',
                    opacity: inMonth ? 1 : 0.55,
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 3px 2px' }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: isToday ? 700 : 500,
                        color: isToday ? '#fff' : pubHoliday || col === 0 ? 'var(--color-error)' : 'var(--color-ink)',
                        background: isToday ? 'var(--color-brand-b)' : 'transparent',
                        borderRadius: 999,
                        padding: isToday ? '0 5px' : 0,
                      }}
                    >
                      {Number(date.slice(8, 10))}
                    </span>
                    {pubHoliday && (
                      <span
                        title={pubHoliday}
                        style={{ flex: 1, minWidth: 0, margin: '0 2px', fontSize: 8, fontWeight: 600, color: 'var(--color-error)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {pubHoliday}
                      </span>
                    )}
                    {openTodos > 0 && (
                      <span title={`남은 할 일 ${openTodos}건`} style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-green)' }}>
                        ✓{openTodos}
                      </span>
                    )}
                  </div>

                  {Array.from({ length: weekLaneCounts[wi] }, (_, lane) => {
                    const ev = events.find((e) => lanes.get(e.id) === lane && eventSegment(e, date, col) !== null);
                    const seg = ev ? eventSegment(ev, date, col) : null;
                    if (!ev || !seg) return <div key={lane} style={{ height: LANE_HEIGHT, marginBottom: 2 }} />;
                    return (
                      <div
                        key={lane}
                        title={`${ev.title}${ev.startDate === ev.endDate ? '' : ` (${ev.startDate.slice(5)} ~ ${ev.endDate.slice(5)})`}`}
                        style={{
                          position: 'relative',
                          height: LANE_HEIGHT,
                          marginBottom: 2,
                          marginLeft: seg.isStart ? 3 : 0,
                          marginRight: seg.isEnd || col === 6 ? (seg.isEnd ? 3 : 0) : -5,
                          background: 'var(--color-orange)',
                          borderRadius: `${seg.isStart ? 4 : 0}px ${seg.isEnd ? 4 : 0}px ${seg.isEnd ? 4 : 0}px ${seg.isStart ? 4 : 0}px`,
                          zIndex: 1,
                        }}
                      >
                        {seg.showLabel && (
                          <span
                            style={{
                              position: 'absolute',
                              left: 3,
                              top: 0,
                              width: `calc(${seg.span * 100}% + ${(seg.span - 1) * 5}px - 8px)`,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: 9,
                              lineHeight: `${LANE_HEIGHT}px`,
                              color: '#fff',
                              zIndex: 2,
                            }}
                          >
                            {ev.title}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 3px 3px' }}>
                    {leaveChips.map((l) => (
                      <span
                        key={l.id}
                        title={`${l.staffName}${l.status === 'pending' ? ' (승인 대기)' : ''}`}
                        style={{
                          fontSize: 9,
                          padding: '1px 3px',
                          borderRadius: 4,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: l.status === 'pending' ? 'var(--color-blue)' : '#fff',
                          background: l.status === 'pending' ? 'transparent' : 'var(--color-blue)',
                          border: l.status === 'pending' ? '1px dashed var(--color-blue)' : '1px solid transparent',
                        }}
                      >
                        {l.staffName}
                        {l.halfDay ? (l.halfDay === 'am' ? '(오전)' : '(오후)') : ''}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <HomeDayPanel
        key={selectedDate}
        date={selectedDate}
        today={today}
        isOwner={isOwner}
        events={selectedEvents}
        leaves={selectedEntries?.leaves ?? []}
        todos={todosForDate(todos, selectedDate, today, filterId)}
        staffList={staffList}
        assigneeFilter={assigneeFilter}
        onChangeFilter={changeFilter}
        onToggleTodo={toggleTodo}
        onDeleteTodo={removeTodo}
        onAddTodo={addTodo}
        onAddEvent={addEvent}
        onDeleteEvent={removeEvent}
      />
    </div>
  );
}
