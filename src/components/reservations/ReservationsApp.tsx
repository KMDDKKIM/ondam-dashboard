'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { DayDetail } from './DayDetail';
import { WeeklyDashboard } from './WeeklyDashboard';
import { MissingClosingBanner } from '@/components/MissingClosingBanner';
import { ensureDailyRecord, listDailyRecords } from '@/lib/reservations/dailyRecords';
import { todayKst } from '@/lib/kst';
import type { DailyRecordSummary } from '@/lib/reservations/types';
import type { MonthlySummary } from '@/lib/monthlySummary';
import type { WeekTrend } from '@/lib/weeklyTrend';

export function ReservationsApp({
  summary,
  rates,
  weeklyTrend = null,
  isOwner,
  missingClosingDates = [],
}: {
  summary: MonthlySummary | null;
  rates: { reservationRate: number | null; noShowRate: number | null };
  weeklyTrend?: WeekTrend[] | null;
  isOwner: boolean;
  missingClosingDates?: string[];
}) {
  const [records, setRecords] = useState<DailyRecordSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKst());
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
      <MissingClosingBanner dates={missingClosingDates} />
      <WeeklyDashboard summary={summary} isOwner={isOwner} rates={rates} weeklyTrend={weeklyTrend} />
      <div className="main-row card" style={{ display: 'flex', overflow: 'hidden' }}>
        <Sidebar
          records={records}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onAddToday={() => handleAddDate(todayKst())}
          onAddDate={handleAddDate}
          addDateError={addDateError}
        />
        <DayDetail key={selectedDate} date={selectedDate} onSaved={refresh} />
      </div>
    </div>
  );
}
