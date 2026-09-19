'use client';

import { useState } from 'react';
import type { DailyRecordSummary } from '@/lib/reservations/types';

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

  function handleAddDateClick() {
    if (!dateInput) return;
    onAddDate(dateInput);
  }

  return (
    <aside
      className="no-print"
      style={{
        width: 160,
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

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {records.map((record) => (
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
              {record.date}
              {record.reservationRowCount > 0 ? ` (예약 ${record.reservationRowCount}명)` : ''}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
