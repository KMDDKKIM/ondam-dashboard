'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReservationTable } from './ReservationTable';
import { ensureDailyRecord, getDailyRecordByDate, replaceReservations } from '@/lib/reservations/dailyRecords';
import { groupByDoctor, visitMarkerFor } from '@/lib/reservations/printSheet';
import type { FirstVisitCandidateDto, FirstVisitCandidatesResult } from '@/lib/firstVisit';
import type { Reservation } from '@/lib/reservations/types';

interface DayDetailProps {
  date: string;
  onSaved: () => void | Promise<void>;
  /** 값이 바뀔 때마다(0 초과) 이 날짜의 인쇄를 자동으로 한 번 시작한다("내일 예약 시트 인쇄"). */
  printToken?: number;
}

export function DayDetail({ date, onSaved, printToken = 0 }: DayDetailProps) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dailyRecordId, setDailyRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );
  // 인쇄용 초진 표시 재료(이전 예약 기록) — 인쇄를 누를 때 불러온다. null 이면 표시 없이 인쇄.
  const [candidates, setCandidates] = useState<FirstVisitCandidateDto[] | null>(null);
  const [printing, setPrinting] = useState(false);
  const [pendingPrint, setPendingPrint] = useState(false);
  const handledToken = useRef(0);

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

  // 인쇄: 초진 표시에 쓸 이전 예약 기록을 먼저 불러온 뒤(실패해도 표시만 빠지고 인쇄는 된다),
  // 화면이 시트로 갱신된 다음(pendingPrint 효과) window.print() 를 부른다. 저장된 명단 기준으로
  // 판정하므로 인쇄할 때마다 새로 불러온다.
  const startPrint = useCallback(async () => {
    setPrinting(true);
    let loaded: FirstVisitCandidateDto[] | null = null;
    try {
      const response = await fetch(`/api/first-visit-candidates?date=${encodeURIComponent(date)}`);
      if (response.ok) {
        const body = (await response.json()) as FirstVisitCandidatesResult;
        loaded = body.candidates;
      }
    } catch {
      // 아래에서 안내
    }
    setCandidates(loaded);
    setStatusMessage(
      loaded ? null : { type: 'error', text: '이전 예약 기록을 불러오지 못해 초진 표시 없이 인쇄합니다.' }
    );
    setPrinting(false);
    setPendingPrint(true);
  }, [date]);

  useEffect(() => {
    if (!pendingPrint) return;
    setPendingPrint(false);
    window.print();
  }, [pendingPrint]);

  // "내일 예약 시트 인쇄" — 불러오기가 끝나면 한 번만 자동으로 인쇄한다.
  useEffect(() => {
    if (printToken <= 0 || loading || handledToken.current === printToken) return;
    handledToken.current = printToken;
    if (reservations.filter((r) => r.visitStatus !== '취소').length === 0) {
      setStatusMessage({ type: 'error', text: `${date} 예약 명단이 아직 없어요. 예약 명단을 먼저 입력해 주세요.` });
      return;
    }
    void startPrint();
  }, [printToken, loading, reservations, date, startPrint]);

  const sheets = useMemo(() => groupByDoctor(reservations), [reservations]);

  if (loading) return <p style={{ padding: 12 }}>불러오는 중...</p>;

  return (
    <div className="day-detail" style={{ padding: 12, flex: 1 }}>
      <h2 className="no-print">{date}</h2>
      <button className="no-print" onClick={() => void startPrint()} disabled={printing} style={{ marginBottom: 12 }}>
        {printing ? '준비 중...' : '인쇄'}
      </button>
      {statusMessage && (
        <p
          className="no-print"
          style={{ color: statusMessage.type === 'success' ? 'var(--color-green)' : 'var(--color-error)' }}
        >
          {statusMessage.text}
        </p>
      )}
      <div className="no-print">
        <ReservationTable
          reservations={reservations}
          onChange={setReservations}
          onSave={handleReservationsSave}
        />
      </div>

      {/* 인쇄용 예약 시트 — 주치의별로 페이지를 나눠 크게 인쇄한다(화면에는 안 보임). */}
      <div className="print-only print-sheet">
        {sheets.map((sheet, index) => (
          <section
            key={sheet.doctorName}
            className={index > 0 ? 'print-sheet-doctor page-break' : 'print-sheet-doctor'}
          >
            <h3>
              {date} 예약 · {sheet.doctorName} ({sheet.rows.length}명)
            </h3>
            <table className="print-sheet-table">
              <thead>
                <tr>
                  <th className="col-time">예약시간</th>
                  <th className="col-name">성함</th>
                  <th className="col-chart">차트번호</th>
                  <th className="col-phone">휴대전화</th>
                  <th>치료부위</th>
                  <th>치료</th>
                  <th>특이사항</th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row, i) => {
                  const marker = visitMarkerFor(row, candidates, date);
                  return (
                    <tr key={i}>
                      <td>{row.timeLabel}</td>
                      <td>
                        {row.patientName}
                        {marker && <span className="first-visit-mark">{marker}</span>}
                      </td>
                      <td>{row.chartNo}</td>
                      <td>{row.mobile || row.phone}</td>
                      <td>{row.treatmentArea}</td>
                      <td>{row.treatment}</td>
                      {/* 붙여넣은 예약시트는 특이사항 칸이 비어 있고 예약메모가 비고로 들어오므로 함께 찍는다. */}
                      <td>{[row.specialNotes, row.memo].filter(Boolean).join(' / ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
