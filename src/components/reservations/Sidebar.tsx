'use client';

import { useState } from 'react';
import type { DailyRecordSummary } from '@/lib/reservations/types';
import { currentMonthKst, shortDateKo } from '@/lib/kst';
import { groupRecordsByMonth, isMonthOpen, monthOf } from '@/lib/reservations/monthGroups';

interface SidebarProps {
  records: DailyRecordSummary[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onAddToday: () => void;
  onAddDate: (date: string) => void;
  addDateError?: string;
}

export function Sidebar({
  records,
  selectedDate,
  onSelectDate,
  onAddToday,
  onAddDate,
  addDateError,
}: SidebarProps) {
  const [dateInput, setDateInput] = useState('');
  // 직원이 직접 펼치거나 접은 달(이 화면 상태로만 기억). 없으면 이번 달과 고른 날짜의 달만 펼친다.
  const [monthOverride, setMonthOverride] = useState<Record<string, boolean>>({});
  const [prevSelectedDate, setPrevSelectedDate] = useState(selectedDate);
  // 접힌 달의 날짜를 고르면(다른 곳에서 바뀐 경우 포함) 그 달을 펼친다.
  if (prevSelectedDate !== selectedDate) {
    setPrevSelectedDate(selectedDate);
    if (selectedDate) setMonthOverride((prev) => ({ ...prev, [monthOf(selectedDate)]: true }));
  }
  const currentMonth = currentMonthKst();
  const groups = groupRecordsByMonth(records);

  function handleAddDateClick() {
    if (!dateInput) return;
    onAddDate(dateInput);
  }

  return (
    <aside
      className="no-print"
      style={{
        width: 120,
        borderRight: '1px solid var(--color-line)',
        background: 'var(--color-bg-2)',
        padding: 8,
      }}
    >
      <button onClick={onAddToday} style={{ width: '100%', padding: '3px 6px', fontSize: 11 }}>
        + 오늘 기록 추가
      </button>

      <div style={{ display: 'flex', gap: 4, marginTop: 6, marginBottom: 10 }}>
        <input
          type="date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          style={{ flex: 1, minWidth: 0, padding: 3, fontSize: 11 }}
        />
        <button onClick={handleAddDateClick} style={{ padding: '3px 6px', fontSize: 11 }}>
          추가
        </button>
      </div>

      {addDateError && (
        <p style={{ color: 'var(--color-error)', fontSize: 13, marginTop: -8, marginBottom: 12 }}>
          {addDateError}
        </p>
      )}

      {groups.map((group) => {
        const open = isMonthOpen(group.month, currentMonth, selectedDate, monthOverride);
        return (
          <div key={group.month} style={{ marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => setMonthOverride((prev) => ({ ...prev, [group.month]: !open }))}
              aria-expanded={open}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '4px 6px',
                fontSize: 12,
                fontWeight: 700,
                background: 'transparent',
                color: 'var(--color-ink)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {open ? '▾' : '▸'} {group.month} ({group.records.length}일)
            </button>
            {open && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {group.records.map((record) => (
                  <li key={record.date}>
                    <button
                      onClick={() => onSelectDate(record.date)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 6,
                        fontSize: 12,
                        background: record.date === selectedDate ? 'linear-gradient(135deg, var(--color-brand-a), var(--color-brand-b))' : 'transparent',
                        color: record.date === selectedDate ? '#fff' : 'var(--color-ink)',
                        fontWeight: record.date === selectedDate ? 700 : 400,
                        border: 'none',
                        borderRadius: 4,
                      }}
                    >
                      {shortDateKo(record.date)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </aside>
  );
}
