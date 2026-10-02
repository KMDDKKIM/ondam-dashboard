'use client';

import { isClinicHoliday } from '@/lib/clinicHolidays';
import type { LeaveKind } from '@/lib/leave';

export interface CalendarEntry {
  id: string;
  staffName: string;
  kind: LeaveKind;
  halfDay: 'am' | 'pm' | null;
  status: 'pending' | 'approved';
}

interface MonthCalendarProps {
  month: string; // YYYY-MM
  weeks: string[][];
  today: string;
  entriesByDate: Map<string, CalendarEntry[]>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const KIND_COLOR: Record<LeaveKind, string> = {
  monthly: '#3b82f6',
  annual: '#16a34a',
};

export function MonthCalendar({ month, weeks, today, entriesByDate, onPrevMonth, onNextMonth }: MonthCalendarProps) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
        <button
          type="button"
          onClick={onPrevMonth}
          style={{ border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', padding: '4px 8px' }}
          aria-label="이전 달"
        >
          ◀
        </button>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{month}</span>
        <button
          type="button"
          onClick={onNextMonth}
          style={{ border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', padding: '4px 8px' }}
          aria-label="다음 달"
        >
          ▶
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            style={{
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: i === 0 ? 'var(--color-error)' : 'var(--color-muted)',
              padding: '4px 0',
            }}
          >
            {label}
          </div>
        ))}
        {weeks.flatMap((week) =>
          week.map((date) => {
            const inMonth = date.slice(0, 7) === month;
            const isToday = date === today;
            const dayNum = Number(date.slice(8, 10));
            const entries = entriesByDate.get(date) ?? [];
            const holiday = isClinicHoliday(date);
            return (
              <div
                key={date}
                style={{
                  minHeight: 76,
                  borderRadius: 8,
                  border: isToday ? '2px solid var(--color-brand-b)' : '1px solid var(--color-line)',
                  background: inMonth ? 'var(--color-surface)' : 'var(--color-surface-2)',
                  padding: 6,
                  opacity: inMonth ? 1 : 0.5,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, marginBottom: 4 }}>
                  {dayNum}
                  {holiday && <span style={{ color: 'var(--color-error)', marginLeft: 4, fontSize: 10 }}>휴진</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {entries.map((entry) => (
                    <span
                      key={entry.id}
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: 999,
                        color: entry.status === 'approved' ? '#fff' : KIND_COLOR[entry.kind],
                        background: entry.status === 'approved' ? KIND_COLOR[entry.kind] : 'transparent',
                        border: entry.status === 'pending' ? `1px dashed ${KIND_COLOR[entry.kind]}` : 'none',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={`${entry.staffName} · ${entry.kind === 'monthly' ? '월차' : '연차'}${entry.halfDay ? (entry.halfDay === 'am' ? ' 오전반차' : ' 오후반차') : ''}${entry.status === 'pending' ? ' (대기중)' : ''}`}
                    >
                      {entry.staffName}
                      {entry.halfDay ? (entry.halfDay === 'am' ? '(오전)' : '(오후)') : ''}
                    </span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
