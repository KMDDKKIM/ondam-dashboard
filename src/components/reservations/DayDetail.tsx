'use client';

import { useEffect, useState } from 'react';
import { ReservationTable } from './ReservationTable';
import { ensureDailyRecord, getDailyRecordByDate, replaceReservations } from '@/lib/reservations/dailyRecords';
import type { Reservation } from '@/lib/reservations/types';

interface DayDetailProps {
  date: string;
  onSaved: () => void | Promise<void>;
}

export function DayDetail({ date, onSaved }: DayDetailProps) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dailyRecordId, setDailyRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatusMessage(null);

    (async () => {
      try {
        const id = await ensureDailyRecord(date);
        const full = await getDailyRecordByDate(date);
        if (cancelled) return;
        setDailyRecordId(id);
        setReservations(full?.reservations ?? []);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        const detail = err instanceof Error ? err.message : '';
        setStatusMessage({
          type: 'error',
          text: `기록을 불러오지 못했습니다.${detail ? ` (${detail})` : ''}`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date]);

  async function handleReservationsSave() {
    if (!dailyRecordId) return;
    try {
      await replaceReservations(dailyRecordId, reservations);
      setStatusMessage({ type: 'success', text: '저장되었습니다.' });
      // 저장은 이미 끝났으니, 사이드바 목록 새로고침이 실패해도 저장 성공
      // 메시지를 덮어쓰지 않는다.
      await Promise.resolve(onSaved()).catch(() => {});
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setStatusMessage({
        type: 'error',
        text: `예약자 명단 저장에 실패했습니다.${detail ? ` (${detail})` : ''}`,
      });
    }
  }

  if (loading) return <p style={{ padding: 12 }}>불러오는 중...</p>;

  return (
    <div className="day-detail" style={{ padding: 12, flex: 1 }}>
      <h2>{date}</h2>
      <button className="no-print" onClick={() => window.print()} style={{ marginBottom: 12 }}>
        인쇄
      </button>
      {statusMessage && (
        <p
          className="no-print"
          style={{ color: statusMessage.type === 'success' ? 'var(--color-green)' : 'var(--color-error)' }}
        >
          {statusMessage.text}
        </p>
      )}
      <ReservationTable
        reservations={reservations}
        onChange={setReservations}
        onSave={handleReservationsSave}
      />
    </div>
  );
}
