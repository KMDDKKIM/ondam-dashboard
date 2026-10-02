'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { confirmDialog } from '@/lib/confirmDialog';
import { currentMonthKst, todayKst } from '@/lib/kst';
import { monthGridWeeks } from '@/lib/leave';
import { buildDayEntries, type DayEntries } from '@/lib/homeCalendar';
import { listLeaveRequests, type LeaveRequest } from '@/lib/supabase/leave';
import { createClinicEvent, deleteClinicEvent, listClinicEvents, type ClinicEvent } from '@/lib/supabase/clinicEvents';

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function HomeCalendar({ isOwner }: { isOwner: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(currentMonthKst());
  const [events, setEvents] = useState<ClinicEvent[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [myId, setMyId] = useState<string | null>(null);

  const [newDate, setNewDate] = useState(todayKst());
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const weeks = useMemo(() => monthGridWeeks(month), [month]);
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][6];

  const refresh = useCallback(async () => {
    try {
      const [eventRows, leaveRows] = await Promise.all([
        listClinicEvents(supabase, { from, to }),
        listLeaveRequests(supabase, { range: { from, to }, status: 'approved' }),
      ]);
      setEvents(eventRows);
      setLeaves(leaveRows);
    } catch {
      setError('달력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [supabase, from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, [supabase]);

  const entriesByDate: Map<string, DayEntries> = useMemo(
    () =>
      buildDayEntries(
        events.map((e) => ({ id: e.id, eventDate: e.eventDate, title: e.title })),
        leaves.map((l) => ({ id: l.id, staffName: l.staffName, startDate: l.startDate, endDate: l.endDate, halfDay: l.halfDay })),
        from,
        to
      ),
    [events, leaves, from, to]
  );

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createClinicEvent(supabase, { eventDate: newDate, title: newTitle.trim(), createdBy: myId });
      setNewTitle('');
      await refresh();
    } catch {
      setError('일정을 추가하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEvent(id: string) {
    if (!(await confirmDialog('이 일정을 삭제할까요?'))) return;
    setError('');
    try {
      await deleteClinicEvent(supabase, id);
      await refresh();
    } catch {
      setError('삭제하지 못했습니다.');
    }
  }

  const today = todayKst();

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
          {weeks.flatMap((week) =>
            week.map((date) => {
              const inMonth = date.slice(0, 7) === month;
              const isToday = date === today;
              const day = entriesByDate.get(date);
              const chips = [
                ...(day?.events.map((e) => ({ kind: 'event' as const, id: e.id, label: e.title })) ?? []),
                ...(day?.leaves.map((l) => ({
                  kind: 'leave' as const,
                  id: l.id,
                  label: `${l.staffName}${l.halfDay ? (l.halfDay === 'am' ? '(오전)' : '(오후)') : ''}`,
                })) ?? []),
              ];
              const shown = chips.slice(0, 2);
              const overflow = chips.length - shown.length;
              return (
                <div
                  key={date}
                  style={{
                    minHeight: 54,
                    borderRadius: 6,
                    border: isToday ? '2px solid var(--color-brand-b)' : '1px solid var(--color-line)',
                    background: inMonth ? 'var(--color-surface)' : 'var(--color-surface-2)',
                    opacity: inMonth ? 1 : 0.5,
                    padding: 3,
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: isToday ? 700 : 500, marginBottom: 2 }}>{Number(date.slice(8, 10))}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {shown.map((chip) => (
                      <span
                        key={chip.id}
                        title={chip.label}
                        style={{
                          fontSize: 9,
                          padding: '1px 3px',
                          borderRadius: 4,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          color: '#fff',
                          background: chip.kind === 'event' ? 'var(--color-orange)' : 'var(--color-blue)',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{chip.label}</span>
                        {chip.kind === 'event' && isOwner && (
                          <button
                            type="button"
                            onClick={() => handleDeleteEvent(chip.id)}
                            aria-label="일정 삭제"
                            style={{ border: 'none', background: 'transparent', color: '#fff', fontSize: 9, lineHeight: 1, padding: 0, cursor: 'pointer', flexShrink: 0 }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {overflow > 0 && <span style={{ fontSize: 9, color: 'var(--color-muted)' }}>+{overflow}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {isOwner && (
        <form onSubmit={handleAddEvent} style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <input className="input-field" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ width: 130, padding: '5px 6px', fontSize: 12 }} />
          <input
            className="input-field"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="일정 추가"
            style={{ flex: 1, padding: '5px 6px', fontSize: 12 }}
          />
          <button type="submit" className="btn-primary" disabled={saving || !newTitle.trim()} style={{ padding: '5px 10px', fontSize: 12 }}>
            추가
          </button>
        </form>
      )}
    </div>
  );
}
