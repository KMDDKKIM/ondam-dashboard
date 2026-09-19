'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { DayDetail } from './DayDetail';
import { WeeklyDashboard } from './WeeklyDashboard';
import { ensureDailyRecord, listDailyRecords } from '@/lib/reservations/dailyRecords';
import type { DailyRecordSummary } from '@/lib/reservations/types';
import type { MonthlySummary } from '@/lib/monthlySummary';

function todayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ReservationsApp({ summary, isOwner }: { summary: MonthlySummary; isOwner: boolean }) {
  const [records, setRecords] = useState<DailyRecordSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [addDateError, setAddDateError] = useState('');

  const refresh = useCallback(async () => {
    setRecords(await listDailyRecords());
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  async function handleAddDate(date: string) {
    try {
      setAddDateError('');
      await ensureDailyRecord(date);
      setSelectedDate(date);
      await refresh();
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setAddDateError(`기록을 추가하지 못했습니다.${detail ? ` (${detail})` : ''}`);
    }
  }

  return (
    <div className="reservation-app app-shell">
      <WeeklyDashboard records={records} summary={summary} isOwner={isOwner} />
      <div className="main-row card" style={{ display: 'flex', overflow: 'hidden' }}>
        <Sidebar
          records={records}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onAddToday={() => handleAddDate(todayString())}
          onAddDate={handleAddDate}
          addDateError={addDateError}
        />
        <DayDetail key={selectedDate} date={selectedDate} onSaved={refresh} />
      </div>
    </div>
  );
}
