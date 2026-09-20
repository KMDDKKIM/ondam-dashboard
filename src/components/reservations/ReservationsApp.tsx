'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { DayDetail } from './DayDetail';
import { WeeklyDashboard } from './WeeklyDashboard';
import { MissingClosingBanner } from '@/components/MissingClosingBanner';
import { ensureDailyRecord, listDailyRecords } from '@/lib/reservations/dailyRecords';
import { addDaysKst, todayKst } from '@/lib/kst';
import type { DailyRecordSummary } from '@/lib/reservations/types';
import type { MonthlySummary } from '@/lib/monthlySummary';

export function ReservationsApp({
  summary,
  rates,
  isOwner,
  missingClosingDates = [],
}: {
  summary: MonthlySummary;
  rates: { reservationRate: number | null; noShowRate: number | null };
  isOwner: boolean;
  missingClosingDates?: string[];
}) {
  const [records, setRecords] = useState<DailyRecordSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKst());
  const [addDateError, setAddDateError] = useState('');
  const [printToken, setPrintToken] = useState(0);

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

  // 내일(한국 날짜) 예약 시트를 열고, 불러오기가 끝나면 바로 인쇄한다.
  function handlePrintTomorrow() {
    setSelectedDate(addDaysKst(todayKst(), 1));
    setPrintToken((n) => n + 1);
  }

  return (
    <div className="reservation-app app-shell">
      <MissingClosingBanner dates={missingClosingDates} />
      <WeeklyDashboard records={records} summary={summary} isOwner={isOwner} rates={rates} />
      <div className="no-print" style={{ marginBottom: 8 }}>
        <button onClick={handlePrintTomorrow}>내일 예약 시트 인쇄</button>
      </div>
      <div className="main-row card" style={{ display: 'flex', overflow: 'hidden' }}>
        <Sidebar
          records={records}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onAddToday={() => handleAddDate(todayKst())}
          onAddDate={handleAddDate}
          addDateError={addDateError}
        />
        <DayDetail key={selectedDate} date={selectedDate} onSaved={refresh} printToken={printToken} />
      </div>
    </div>
  );
}
