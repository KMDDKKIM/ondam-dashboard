'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReservationTable } from './ReservationTable';
import { ensureDailyRecord, getDailyRecordByDate, replaceReservations } from '@/lib/reservations/dailyRecords';
import { countByDoctor, flattenForPrint, printFontPt, shouldStartPrint, visitMarkerFor, type PrintRequest } from '@/lib/reservations/printSheet';
import type { FirstVisitCandidateDto, FirstVisitCandidatesResult } from '@/lib/firstVisit';
import type { Reservation } from '@/lib/reservations/types';

interface DayDetailProps {
  date: string;
  onSaved: () => void | Promise<void>;
  /** "내일 예약 시트 인쇄" 요청. 이 날짜 것일 때만 불러오기 후 한 번 인쇄하고, onPrintHandled 로 요청을 소진시킨다. */
  printRequest?: PrintRequest | null;
  onPrintHandled?: () => void;
}

export function DayDetail({ date, onSaved, printRequest = null, onPrintHandled }: DayDetailProps) {
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
  const [syncingGrowthMate, setSyncingGrowthMate] = useState(false);
  const handledRequestId = useRef(0);
  // "결과" 자동저장을 순서대로 처리한다 — 여러 줄을 빠르게 잇달아 누르면 저장 응답이 요청
  // 순서와 다르게 돌아올 수 있어, 앞 저장이 끝난 뒤에만 다음 저장을 보낸다(먼저 누른 게
  // 나중에 도착해 최신 결과를 덮어쓰는 일이 없게).
  const resultSaveChain = useRef<Promise<void>>(Promise.resolve());

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

  async function handleReservationsSave(rows: Reservation[]) {
    if (!dailyRecordId) return;
    try {
      await replaceReservations(dailyRecordId, rows);
      setReservations(rows);
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

  // "결과"(정상/노쇼/취소)를 누르면 바로 저장한다 — 날짜를 옮기거나 핀셋포인트에서 다시
  // 가져와도 방금 누른 표시가 사라지지 않게. "저장" 버튼과 달리 조용히 처리하고(문구 없음),
  // 실패했을 때만 알린다. 시간순 재배치는 하지 않는다(handleReservationsSave에서만).
  function handleResultAutoSave(rows: Reservation[]) {
    resultSaveChain.current = resultSaveChain.current.then(async () => {
      if (!dailyRecordId) return;
      try {
        await replaceReservations(dailyRecordId, rows);
        setReservations(rows);
        setStatusMessage(null);
      } catch {
        setStatusMessage({ type: 'error', text: '결과 저장에 실패했어요. 다시 눌러 주세요.' });
      }
    });
  }

  // 핀셋포인트(growth-mate.co.kr)의 정상이행/노쇼/취소를 이름으로 대조해 채운다. 서버가 이미
  // 저장까지 끝내고 최신 명단을 돌려주므로, 여기서는 화면 상태만 그 값으로 바꾼다.
  async function handleGrowthMateSync() {
    setSyncingGrowthMate(true);
    setStatusMessage(null);
    // 방금 누른 "결과" 자동저장이 아직 진행 중이면 먼저 끝내고 나서 가져온다 — 순서가
    // 엇갈려 방금 누른 결과가 덮어써지지 않게.
    await resultSaveChain.current;
    try {
      const response = await fetch('/api/growth-mate-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? '가져오지 못했습니다.');
      setReservations(body.reservations as Reservation[]);
      const unmatched = (body.unmatchedNames as string[]) ?? [];
      const parts = [`${body.changedCount}명 결과를 반영했어요.`];
      if (unmatched.length > 0) parts.push(`이름을 못 찾은 환자: ${unmatched.join(', ')}`);
      setStatusMessage({ type: 'success', text: parts.join(' ') });
      await Promise.resolve(onSaved()).catch(() => {});
    } catch (err) {
      const detail = err instanceof Error ? err.message : '';
      setStatusMessage({ type: 'error', text: detail || '핀셋포인트에서 가져오지 못했습니다.' });
    } finally {
      setSyncingGrowthMate(false);
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
        loaded = body.candidates.filter((c) => !c.fromReception); // 예약 시트의 초진 표시는 예약 명단 기준만
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

  // "내일 예약 시트 인쇄" — 그 날짜의 불러오기가 끝나면 한 번만 자동으로 인쇄하고 요청을 소진시킨다.
  useEffect(() => {
    if (!shouldStartPrint(printRequest, date, loading, handledRequestId.current)) return;
    handledRequestId.current = printRequest!.id;
    onPrintHandled?.();
    if (reservations.filter((r) => r.visitStatus !== '취소').length === 0) {
      setStatusMessage({ type: 'error', text: `${date} 예약 명단이 아직 없어요. 예약 명단을 먼저 입력해 주세요.` });
      return;
    }
    void startPrint();
  }, [printRequest, loading, reservations, date, startPrint, onPrintHandled]);

  const printRows = useMemo(() => flattenForPrint(reservations), [reservations]);
  const doctorCounts = useMemo(() => countByDoctor(printRows), [printRows]);

  if (loading) return <p style={{ padding: 12 }}>불러오는 중...</p>;

  return (
    <div className="day-detail" style={{ padding: 12, flex: 1 }}>
      <h2 className="no-print">
        {date} {reservations.length > 0 ? `· 예약 ${reservations.length}명` : ''}
      </h2>
      <button className="no-print" onClick={() => void startPrint()} disabled={printing} style={{ marginBottom: 12 }}>
        {printing ? '준비 중...' : '인쇄'}
      </button>
      <button
        className="no-print"
        onClick={() => void handleGrowthMateSync()}
        disabled={syncingGrowthMate}
        title="핀셋포인트(growth-mate.co.kr)의 정상이행/노쇼/취소를 이름으로 대조해 채워요"
        style={{ marginBottom: 12, marginLeft: 8 }}
      >
        {syncingGrowthMate ? '가져오는 중...' : '핀셋포인트에서 결과 가져오기'}
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
          onResultChange={handleResultAutoSave}
        />
      </div>

      {/* 인쇄용 예약 시트 — 가로 A4 한 장에 전체 예약을 시간순 한 표로(50명까지 한 장). 화면에는 안 보인다. */}
      <div className="print-only print-sheet" style={{ ['--print-pt' as string]: `${printFontPt(printRows.length)}pt` }}>
        <h3>
          {date} 예약 ({printRows.length}명)
          <span className="print-sheet-summary">
            {doctorCounts.map((d) => `${d.doctorName} ${d.count}명`).join(' · ')}
          </span>
        </h3>
        <table className="print-sheet-table">
          <thead>
            <tr>
              <th className="col-time">예약시간</th>
              <th className="col-name">성함</th>
              <th className="col-chart">차트번호</th>
              <th className="col-phone">휴대전화</th>
              <th className="col-doctor">주치의</th>
              <th>치료부위</th>
              <th>치료</th>
              <th>특이사항</th>
            </tr>
          </thead>
          <tbody>
            {printRows.map((row, i) => {
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
                  <td>{row.printDoctor}</td>
                  <td>{row.treatmentArea}</td>
                  <td>{row.treatment}</td>
                  {/* 붙여넣은 예약시트는 특이사항 칸이 비어 있고 예약메모가 비고로 들어오므로 함께 찍는다. */}
                  <td>{[row.specialNotes, row.memo].filter(Boolean).join(' / ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
