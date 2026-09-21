'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { analyzePasteText } from '@/lib/pasteImport';
import { parseSettlementVisits } from '@/lib/settlementVisits';
import { replaceDailyVisits } from '@/lib/supabase/dailyVisits';
import { closingSaveWarnings } from '@/lib/closingChecks';
import { todayKst } from '@/lib/kst';
import { listReceptionRecords } from '@/lib/supabase/receptionRecords';
import { nextBookingPrefill } from '@/lib/receptionLog';
import { errorAfterOtherSectionSaved, VISITS_NOT_SAVED_ERROR } from '@/lib/sectionMessages';
import { replaceConfirmMessage, summarizeReplace } from '@/lib/reservationReplace';
import { buildClosingMessage, countMismatch, splitNames, summarizePurchases } from '@/lib/closingMessage';
import { listPurchasesByDate } from '@/lib/supabase/nonCoveredPurchases';
import { computeDerivedStats } from '@/lib/reservations/reservationStats';
import { formatSavedAt } from '@/lib/savedAt';
import {
  upsertDailyRevenue,
  getSavedDailyClosing,
  getSavedDailyRevenue,
  upsertMonthlyOverride,
  listRecentDailyRevenue,
  listRecentMonthlyOverrides,
  type MonthlyOverrideRow,
} from '@/lib/supabase/dailyRevenue';
import type { DailyRevenue } from '@/lib/types';

const sectionCardStyle = { padding: 16, marginBottom: 20 } as const;
const headerStyle = { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 8, fontSize: 14 } as const;
const textareaStyle = { minHeight: 64, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' as const };

// 붙여넣은 결산표에 숫자가 아닌 값이 있으면 조용히 0으로 저장하지 않고 이렇게 알리고 저장을 막는다.
function InvalidCellsNotice({ cells }: { cells: string[] }) {
  return (
    <p className="error-text" style={{ marginTop: 8 }}>
      숫자가 아닌 값이 있어서 저장할 수 없어요: {cells.join(', ')}. 엑셀에서 해당 칸을 확인하고 다시 복사해 붙여넣어 주세요.
    </p>
  );
}

// ── 월결산 ──────────────────────────────────────────────────────────
// 월은 붙여넣은 결산표 제목("월말결산:2026-09")에서 읽어 오므로 따로 고르지 않는다.
function MonthlySettlementSection({ clearSignal, onOutcome }: SectionSync) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<MonthlyOverrideRow[]>([]);
  const supabase = createClient();

  // 다른 칸을 저장하면 이 칸에 남은 예전 결과/오류 문구를 지운다(칸마다 자기 최신 상태만 보이게).
  useEffect(() => {
    if (clearSignal > 0) {
      setResult('');
      // 다시 저장해야 하는 오류(예: 내원 환자 명단 저장 실패)는 다른 칸을 저장해도 남긴다.
      setError(errorAfterOtherSectionSaved);
    }
  }, [clearSignal]);

  async function loadHistory() {
    try {
      setHistory(await listRecentMonthlyOverrides(supabase));
    } catch {
      // 기록을 못 불러와도 입력 자체는 계속 쓸 수 있어야 한다.
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analysis = useMemo(() => (text.trim() ? analyzePasteText(text) : null), [text]);

  const month = analysis?.format === 'monthly' ? analysis.month : null;
  const totalRevenue = analysis?.format === 'monthly' ? analysis.totalRevenue : null;
  const avgDailyVisits = analysis?.format === 'monthly' ? analysis.avgDailyVisits : null;
  const invalidCells = analysis?.format === 'monthly' ? analysis.invalidCells : [];
  // 기준일 = 붙여넣은 표의 마지막 일자, 없으면 오늘(한국 날짜). 이 날짜까지는 월결산 값이 맞고 그 뒤 일일결산이 더해진다.
  const asOfDate = analysis?.format === 'monthly' ? (analysis.latestDate ?? todayKst()) : null;
  const formatError = analysis && analysis.format !== 'monthly';

  async function handleSave() {
    if (totalRevenue == null || !month || !asOfDate || invalidCells.length > 0) return;
    // 붙여넣은 표에 날짜별 행이 없으면 기준일이 오늘로 잡혀서 오늘 마감이 합산되지 않는다 — 먼저 확인받는다.
    if (analysis?.format === 'monthly' && analysis.latestDate == null) {
      const fallbackOk = await confirmDialog(
        `붙여넣은 표에 날짜별 행이 없어 오늘(${asOfDate})을 기준일로 저장해요. 오늘 마감은 합산되지 않아요. 계속할까요?`
      );
      if (!fallbackOk) return;
    }
    const ok = await confirmDialog(
      `${month}의 총매출을 ${asOfDate}까지 ${totalRevenue.toLocaleString()}원으로 다시 채웁니다. 그 뒤 일일 마감이 여기에 더해져요. 계속할까요?`
    );
    if (!ok) return;
    setSaving(true);
    setError('');
    setResult('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await upsertMonthlyOverride(supabase, month, totalRevenue, avgDailyVisits, asOfDate, user?.id ?? null);
      setResult(
        `${month} 매출을 ${asOfDate}까지 ${totalRevenue.toLocaleString()}원${avgDailyVisits != null ? `, 일평균 환자수를 ${avgDailyVisits}명` : ''}으로 저장했어요.`
      );
      setText('');
      onOutcome();
      await loadHistory();
    } catch {
      setError('저장에 실패했습니다.');
      onOutcome();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={sectionCardStyle}>
      <div style={headerStyle}>
        <span>📆</span>
        <span>월결산 입력</span>
        <span className="muted-text" style={{ fontWeight: 400, fontSize: 12 }}>
          — 붙여넣은 표의 마지막 날짜까지의 값으로 잡고, 그 뒤 일일 마감은 여기에 더해져요
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="월말 결산표를 여기에 붙여넣으세요 (Ctrl+V)"
        className="input-field"
        style={textareaStyle}
      />

      {formatError && <p className="error-text" style={{ marginTop: 8 }}>{analysis.format === 'unknown' ? analysis.reason : '월결산표가 아닌 것 같아요. 다른 칸에 붙여넣어 주세요.'}</p>}
      {invalidCells.length > 0 && <InvalidCellsNotice cells={invalidCells} />}
      {totalRevenue != null && month && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>
            {month} 총매출 {totalRevenue.toLocaleString()}원
            {avgDailyVisits != null ? `, 일평균 환자수 ${avgDailyVisits}명` : ''} · 기준일 {asOfDate} 확인됨
          </span>
          <button onClick={handleSave} disabled={saving || invalidCells.length > 0} className="btn-primary" style={{ padding: '6px 16px', fontSize: 13 }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
      {result && <p style={{ color: 'var(--color-teal-deep)', fontSize: 13, marginTop: 8 }}>{result}</p>}

      {history.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="muted-text" style={{ fontSize: 12, marginBottom: 6 }}>최근 저장 기록</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {history.map((h) => (
              <li key={h.month} className="muted-text" style={{ fontSize: 12, background: 'var(--color-surface-2)', borderRadius: 8, padding: '4px 10px' }}>
                {h.month} · {h.totalRevenue.toLocaleString()}원{h.avgDailyVisits != null ? ` · 일평균 ${h.avgDailyVisits}명` : ''}{h.asOfDate ? ` · ${h.asOfDate}까지` : ' · 기준일 없음'} · 저장 {formatSavedAt(h.updatedAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── 예약 명단 ─────────────────────────────────────────────────────────
function ReservationSection({ onSaved, clearSignal, onOutcome }: SectionSync & { onSaved: (dates: string[]) => void }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<{ date: string; reservationCount: number; updatedAt: string }[]>([]);
  const supabase = createClient();

  // 다른 칸을 저장하면 이 칸에 남은 예전 결과/오류 문구를 지운다(칸마다 자기 최신 상태만 보이게).
  useEffect(() => {
    if (clearSignal > 0) {
      setResult('');
      // 다시 저장해야 하는 오류(예: 내원 환자 명단 저장 실패)는 다른 칸을 저장해도 남긴다.
      setError(errorAfterOtherSectionSaved);
    }
  }, [clearSignal]);

  async function loadHistory() {
    try {
      const response = await fetch('/api/reservation-paste');
      const body = await response.json();
      if (response.ok) setHistory(body.records ?? []);
    } catch {
      // 기록을 못 불러와도 입력 자체는 계속 쓸 수 있어야 한다.
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analysis = useMemo(() => (text.trim() ? analyzePasteText(text) : null), [text]);
  const formatError = analysis && analysis.format !== 'reservation';

  async function handleSave() {
    if (!analysis || analysis.format !== 'reservation') return;
    setSaving(true);
    setError('');
    setResult('');
    try {
      // 저장 전에 날짜별 "기존 N명 → 새 N명"을 확인받는다(새 명단이 기존의 절반 미만이면 경고 추가).
      const dates = analysis.groups.map((g) => g.date);
      const countsResponse = await fetch(`/api/reservation-paste?dates=${encodeURIComponent(dates.join(','))}`);
      const countsBody = await countsResponse.json().catch(() => null);
      if (!countsResponse.ok || !countsBody?.counts) {
        throw new Error(countsBody?.error ?? '기존 예약 명단을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
      const lines = summarizeReplace(
        analysis.groups.map((g) => ({ date: g.date, newCount: g.rows.length })),
        countsBody.counts as Record<string, number>
      );
      if (!await confirmDialog(replaceConfirmMessage(lines))) return;

      const response = await fetch('/api/reservation-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const body = await response.json();
      // 여러 날짜 중 일부만 저장된 채 실패했더라도, 저장된 날짜는 결산 칸을 다시 계산한다.
      if (Array.isArray(body.savedDates) && body.savedDates.length > 0) onSaved(body.savedDates);
      if (!response.ok) throw new Error(body.error ?? '저장에 실패했습니다.');
      const savedDates = body.savedDates as string[];
      setResult(`예약관리에 저장했어요: ${savedDates.join(', ')}`);
      setText('');
      onOutcome();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      onOutcome();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={sectionCardStyle}>
      <div style={headerStyle}>
        <span>📅</span>
        <span>예약 명단 입력</span>
        <span className="muted-text" style={{ fontWeight: 400, fontSize: 12 }}>
          — 예약관리 페이지와 예약률·부도취소율에 자동 반영돼요
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="예약시트(예약목록)를 여기에 붙여넣으세요 (Ctrl+V)"
        className="input-field"
        style={textareaStyle}
      />

      {formatError && <p className="error-text" style={{ marginTop: 8 }}>{analysis.format === 'unknown' ? analysis.reason : '예약시트가 아닌 것 같아요. 다른 칸에 붙여넣어 주세요.'}</p>}
      {analysis?.format === 'reservation' && (
        <div style={{ marginTop: 10 }}>
          <ul style={{ margin: 0, marginBottom: 10, paddingLeft: 18, fontSize: 13 }}>
            {analysis.groups.map((g) => (
              <li key={g.date}>{g.date} — 예약 {g.rows.length}건 (기존 목록을 대체합니다)</li>
            ))}
          </ul>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ padding: '6px 16px', fontSize: 13 }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
      {result && <p style={{ color: 'var(--color-teal-deep)', fontSize: 13, marginTop: 8 }}>{result}</p>}

      {history.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="muted-text" style={{ fontSize: 12, marginBottom: 6 }}>최근 저장 기록</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {history.map((h) => (
              <li key={h.date} className="muted-text" style={{ fontSize: 12, background: 'var(--color-surface-2)', borderRadius: 8, padding: '4px 10px' }}>
                {h.date} · 예약 {h.reservationCount}건 · 저장 {formatSavedAt(h.updatedAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── 일일결산 ──────────────────────────────────────────────────────────
// 날짜는 붙여넣은 결산표의 "진료날짜"에서 읽어 오므로 따로 고르지 않는다. 결산표 아래
// "일일 결산" 칸에 예약·추나·제외환자 숫자를 넣으면 원장님께 보낼 마무리 멘트가 만들어지고,
// 맨 아래 저장 버튼이 결산표(매출·내원)와 이 숫자들을 함께 저장한다.
interface ClosingFields {
  reservationCount: string; // 오늘 예약 환자수
  keptCount: string; // 예약 정상 이행
  noshowCount: string; // 예약 노쇼
  cancelCount: string; // 예약 취소
  nextBookingCount: string; // 다음예약 접수한 환자수
  chunaCount: string;
  chunaNames: string;
  excludedCount: string;
  excludedNames: string;
  herbSales: string;
  naverReviewCount: string;
  firstVisitCount: string;
  referralCount: string;
  referralNames: string;
}

const EMPTY_CLOSING: ClosingFields = {
  reservationCount: '',
  keptCount: '',
  noshowCount: '',
  cancelCount: '',
  nextBookingCount: '',
  chunaCount: '',
  chunaNames: '',
  excludedCount: '',
  excludedNames: '',
  herbSales: '',
  naverReviewCount: '',
  firstVisitCount: '',
  referralCount: '',
  referralNames: '',
};

function toNumberOrNull(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--color-orange)' }}>⚠ {children}</p>
  );
}

// 예약 명단이 저장될 때마다 version 이 오르고 dates 에 저장된 날짜가 담긴다 — 결산 칸이 "저장된
// 예약 명단"에서 미리 채워지므로, 명단을 결산보다 나중에 붙여넣어도 칸이 다시 계산돼야 한다.
interface ReservationSync {
  version: number;
  dates: string[];
}

// 칸마다 자기 최신 결과만 보이도록: 한 칸이 저장 결과(성공/실패)를 내면 onOutcome 으로 알리고,
// 부모가 다른 칸들의 clearSignal 을 올리면 그 칸들은 예전 결과/오류 문구를 지운다.
// (정상 이행+노쇼+취소 불일치 같은 입력 상태 경고는 결과 문구가 아니라 그대로 둔다.)
interface SectionSync {
  clearSignal: number;
  onOutcome: () => void;
}

function DailySettlementSection({ reservationSync, clearSignal, onOutcome }: SectionSync & { reservationSync: ReservationSync }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<DailyRevenue[]>([]);
  const [closing, setClosing] = useState<ClosingFields>(EMPTY_CLOSING);
  const [copied, setCopied] = useState(false);
  // 다음예약 접수 환자수를 접수기록부로 미리 채웠을 때의 인원(직접 고치면 사라진다).
  const [receptionHint, setReceptionHint] = useState<number | null>(null);
  const supabase = createClient();

  // 다른 칸을 저장하면 이 칸에 남은 예전 결과/오류 문구를 지운다(칸마다 자기 최신 상태만 보이게).
  useEffect(() => {
    if (clearSignal > 0) {
      setResult('');
      // 다시 저장해야 하는 오류(예: 내원 환자 명단 저장 실패)는 다른 칸을 저장해도 남긴다.
      setError(errorAfterOtherSectionSaved);
    }
  }, [clearSignal]);

  async function loadHistory() {
    try {
      setHistory(await listRecentDailyRevenue(supabase));
    } catch {
      // 기록을 못 불러와도 입력 자체는 계속 쓸 수 있어야 한다.
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analysis = useMemo(() => (text.trim() ? analyzePasteText(text) : null), [text]);

  const date = analysis?.format === 'daily' ? analysis.date : null;
  const totalRevenue = analysis?.format === 'daily' ? analysis.totalRevenue : null;
  const visitCount = analysis?.format === 'daily' ? analysis.visitCount : null;
  const newPatientCount = analysis?.format === 'daily' ? analysis.newPatientCount : null;
  const invalidCells = analysis?.format === 'daily' ? analysis.invalidCells : [];
  // 결산표 아래 환자 목록(이름·차트번호). 저장하면 초진환자 해피콜의 초진·재초진 후보로 쓰인다.
  const visits = useMemo(() => (analysis?.format === 'daily' ? parseSettlementVisits(text) : []), [analysis, text]);
  const formatError = analysis && analysis.format !== 'daily';
  const missingDate = analysis?.format === 'daily' && !analysis.date;

  // 새 결산표가 붙여넣어져 날짜가 정해지면 칸을 미리 채운다(모두 직접 고칠 수 있다).
  //  1) 그 날짜에 이미 저장해 둔 일일 결산 숫자가 있으면 그것을,
  //  2) 없으면 저장된 예약 명단에서 예약·정상 이행(내원)·취소·추나를 세서,
  //  3) 한약·비급여 판매는 그 날 비급여 현황 등록분으로, 초진은 결산표의 신규환자수로.
  // 노쇼와 제외환자는 명단만으로 알 수 없어 직접 입력한다.
  // 예약 명단이 새로 저장되면(reservationSync.version) 그 날짜가 지금 결산 날짜일 때만, 그리고 명단에서
  // 나오는 칸(예약·정상 이행·취소·추나)만 다시 채운다 — 손으로 넣은 노쇼·제외환자·판매·초진 등은
  // 그대로 둔다. 이미 저장해 둔 결산이 있으면 그 값이 우선이라 아무것도 바꾸지 않는다.
  const handledSyncVersion = useRef(reservationSync.version);
  useEffect(() => {
    if (!date) {
      setClosing(EMPTY_CLOSING);
      setReceptionHint(null);
      return;
    }
    let syncOnly = false;
    if (handledSyncVersion.current !== reservationSync.version) {
      handledSyncVersion.current = reservationSync.version;
      if (!reservationSync.dates.includes(date)) return;
      syncOnly = true;
    }
    let cancelled = false;
    (async () => {
      if (syncOnly) {
        let rows: { visitStatus: string }[] = [];
        try {
          const response = await fetch(`/api/records/${encodeURIComponent(date)}`);
          const record = response.ok ? await response.json() : null;
          if (record && Array.isArray(record.reservations)) rows = record.reservations;
        } catch {
          return;
        }
        if (rows.length === 0) return;
        try {
          if (await getSavedDailyClosing(supabase, date)) return;
        } catch {
          // 저장된 값을 확인하지 못해도 명단에서 센 값으로 채운다.
        }
        const stats = computeDerivedStats(rows as Parameters<typeof computeDerivedStats>[0]);
        if (cancelled) return;
        setClosing((prev) => ({
          ...prev,
          reservationCount: String(rows.length),
          keptCount: String(rows.filter((r) => r.visitStatus === '내원').length),
          cancelCount: String(rows.filter((r) => r.visitStatus === '취소').length),
          chunaCount: String(stats.chunaCount),
          chunaNames: stats.chunaNames.join(' '),
        }));
        return;
      }
      const next: ClosingFields = { ...EMPTY_CLOSING, firstVisitCount: newPatientCount ? String(newPatientCount) : '' };
      const str = (v: number | null) => (v != null ? String(v) : '');

      let derived: ReturnType<typeof computeDerivedStats> | null = null;
      let listRows: { visitStatus: string }[] = [];
      try {
        const response = await fetch(`/api/records/${encodeURIComponent(date)}`);
        const record = response.ok ? await response.json() : null;
        if (record && Array.isArray(record.reservations) && record.reservations.length > 0) {
          derived = computeDerivedStats(record.reservations);
          listRows = record.reservations;
        }
      } catch {
        // 예약 명단이 없어도 직접 입력하면 된다.
      }
      if (derived) {
        // 이름은 띄어쓰기로 구분해서 채운다(멘트에는 쉼표로 나온다).
        next.chunaNames = derived.chunaNames.join(' ');
        next.chunaCount = String(derived.chunaCount);
      }

      let saved = null;
      let savedKnown = true;
      try {
        saved = await getSavedDailyClosing(supabase, date);
      } catch {
        // 저장된 값이 없으면 명단에서 센 값을 쓴다.
        savedKnown = false;
      }
      if (saved) {
        next.reservationCount = str(saved.reservationCount);
        next.keptCount = str(saved.keptCount);
        next.noshowCount = str(saved.noshowCount);
        next.cancelCount = str(saved.cancelCount);
        next.nextBookingCount = str(saved.nextBookingCount);
        next.chunaCount = str(saved.chunaCount);
        next.excludedCount = str(saved.excludedCount);
      } else if (derived) {
        const kept = listRows.filter((r) => r.visitStatus === '내원').length;
        const cancelled = listRows.filter((r) => r.visitStatus === '취소').length;
        next.reservationCount = String(listRows.length);
        next.keptCount = String(kept);
        next.cancelCount = String(cancelled);
        // 노쇼는 명단에 "내원" 표시가 빠진 예약과 구분이 안 돼서 자동으로 세지 않는다 —
        // 직접 입력하게 하고, 합계가 안 맞으면 아래 주의 표시가 뜬다.
      }

      try {
        next.herbSales = summarizePurchases(await listPurchasesByDate(supabase, date));
      } catch {
        // 비급여 기록이 없어도 직접 입력하면 된다.
      }

      // 다음예약 접수 환자수: 저장된 결산이 없고 칸이 비어 있을 때만, 접수기록부에서 "예약" 체크된 환자 수로 미리 채운다.
      // 못 읽어도(표 없음·권한 없음 등) 조용히 건너뛴다 — 직접 입력하면 된다.
      let hint: number | null = null;
      if (savedKnown) {
        try {
          hint = nextBookingPrefill(await listReceptionRecords(supabase, date), { savedClosingExists: saved != null, currentValue: next.nextBookingCount });
        } catch {
          hint = null;
        }
        if (hint != null) next.nextBookingCount = String(hint);
      }
      if (cancelled) return;
      setReceptionHint(hint);
      setClosing(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, newPatientCount, reservationSync]);

  const n = (key: keyof ClosingFields) => toNumberOrNull(closing[key]);

  const message = useMemo(
    () =>
      buildClosingMessage({
        visitCount,
        excludedNames: closing.excludedNames,
        reservationCount: toNumberOrNull(closing.reservationCount),
        chunaCount: toNumberOrNull(closing.chunaCount),
        chunaNames: closing.chunaNames,
        herbSales: closing.herbSales,
        naverReviewCount: toNumberOrNull(closing.naverReviewCount),
        firstVisitCount: toNumberOrNull(closing.firstVisitCount),
        referralCount: toNumberOrNull(closing.referralCount),
        referralNames: closing.referralNames,
      }),
    [visitCount, closing]
  );

  const chunaMismatch = countMismatch(n('chunaCount'), closing.chunaNames);
  const excludedMismatch = countMismatch(n('excludedCount'), closing.excludedNames);
  const referralMismatch = countMismatch(n('referralCount'), closing.referralNames);
  const reservationEntered = n('reservationCount') != null;
  const outcomeSum = (n('keptCount') ?? 0) + (n('noshowCount') ?? 0) + (n('cancelCount') ?? 0);
  const outcomeMismatch =
    reservationEntered &&
    (n('keptCount') != null || n('noshowCount') != null || n('cancelCount') != null) &&
    outcomeSum !== n('reservationCount');

  function setField(key: keyof ClosingFields, value: string) {
    if (key === 'nextBookingCount') setReceptionHint(null);
    setClosing((prev) => ({ ...prev, [key]: value }));
    setCopied(false);
    setResult('');
  }

  // 붙여넣은 결산표와 아래 칸을 전부 비운다(화면만 비우고, 이미 저장한 기록은 그대로다).
  async function handleClearAll() {
    if (text.trim() && !await confirmDialog('붙여넣은 결산표와 아래 입력칸을 모두 비울까요? (이미 저장한 기록은 그대로예요)')) return;
    setText('');
    setClosing(EMPTY_CLOSING);
    setReceptionHint(null);
    setCopied(false);
    setError('');
    setResult('');
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setError('복사하지 못했어요. 위 멘트를 직접 선택해서 복사해 주세요.');
    }
  }

  async function handleSave() {
    if (totalRevenue == null || !date || invalidCells.length > 0) return;
    setSaving(true);
    setError('');
    setResult('');
    try {
      // 저장 전 확인: 매출/내원 0, 미래 날짜, 이미 저장된 마감(덮어쓰기)이면 한 번 더 묻는다.
      const existing = await getSavedDailyRevenue(supabase, date);
      const warnings = closingSaveWarnings({ date, totalRevenue, visitCount, today: todayKst(), existing });
      if (warnings.length > 0) {
        const ok = await confirmDialog(`${date} 일일 결산을 저장합니다.\n\n${warnings.map((w) => `- ${w}`).join('\n')}\n\n그래도 저장할까요?`);
        if (!ok) return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await upsertDailyRevenue(supabase, {
        date,
        totalRevenue,
        visitCount,
        newPatientCount,
        closing: {
          reservationCount: n('reservationCount'),
          keptCount: n('keptCount'),
          noshowCount: n('noshowCount'),
          cancelCount: n('cancelCount'),
          nextBookingCount: n('nextBookingCount'),
          chunaCount: n('chunaCount') ?? (closing.chunaNames.trim() ? splitNames(closing.chunaNames).length : null),
          excludedCount: n('excludedCount') ?? (closing.excludedNames.trim() ? splitNames(closing.excludedNames).length : null),
        },
        updatedBy: user?.id ?? null,
      });
      let visitsNote = '';
      if (visits.length > 0) {
        try {
          await replaceDailyVisits(supabase, date, visits, user?.id ?? null);
          visitsNote = ` 내원 환자 ${visits.length}명의 이름·차트번호도 저장했어요.`;
        } catch {
          setError(VISITS_NOT_SAVED_ERROR);
        }
      }
      setResult(`${date} 일일 결산을 저장했어요. (매출 ${totalRevenue.toLocaleString()}원${visitCount != null ? `, 내원 ${visitCount}명` : ''})${visitsNote}`);
      onOutcome();
      await loadHistory();
    } catch {
      setError('저장에 실패했습니다.');
      onOutcome();
    } finally {
      setSaving(false);
    }
  }

  const label = { display: 'block', marginBottom: 4, fontSize: 12 } as const;
  const groupTitle = { fontWeight: 700, fontSize: 12, margin: '12px 0 6px' } as const;
  const numberInput = (key: keyof ClosingFields, extra?: { placeholder?: string }) => (
    <input
      type="number"
      min={0}
      value={closing[key]}
      onChange={(e) => setField(key, e.target.value)}
      className="input-field"
      placeholder={extra?.placeholder}
    />
  );

  return (
    <div className="card" style={sectionCardStyle}>
      <div style={headerStyle}>
        <span>💴</span>
        <span>일일결산 입력</span>
        <span className="muted-text" style={{ fontWeight: 400, fontSize: 12 }}>
          — 결산표를 붙여넣고, 아래 숫자를 확인·입력한 뒤 저장하세요
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult('');
          // 내원 환자 명단 저장 실패 안내는 일일결산을 다시 저장할 때까지 남긴다.
          setError(errorAfterOtherSectionSaved);
          setCopied(false);
        }}
        placeholder="일일 결산표를 여기에 붙여넣으세요 (Ctrl+V)"
        className="input-field"
        style={textareaStyle}
      />

      {formatError && <p className="error-text" style={{ marginTop: 8 }}>{analysis.format === 'unknown' ? analysis.reason : '일일 결산표가 아닌 것 같아요. 다른 칸에 붙여넣어 주세요.'}</p>}
      {invalidCells.length > 0 && <InvalidCellsNotice cells={invalidCells} />}
      {missingDate && (
        <p className="error-text" style={{ marginTop: 8 }}>
          결산표에서 진료날짜를 찾지 못했어요. "진료날짜:YYYY-MM-DD" 줄이 함께 복사되도록 다시 붙여넣어 주세요.
        </p>
      )}

      {totalRevenue != null && date && (
        <div className="card" style={{ marginTop: 12, padding: 14, background: 'var(--color-surface-2)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
            📝 일일 결산 <span className="muted-text" style={{ fontWeight: 400 }}>· {date}</span>
          </div>
          <p className="muted-text" style={{ fontSize: 12, marginBottom: 4 }}>
            금일환자수 {visitCount ?? 0}명 · 매출 {totalRevenue.toLocaleString()}원 (결산표에서 읽음). 예약 명단·비급여를 저장해 둔 날은
            아래 칸이 자동으로 채워져요. 이름은 띄어쓰기로 구분하세요.
          </p>
          <p style={{ fontSize: 12, marginBottom: 4, color: visits.length > 0 ? 'var(--color-teal-deep)' : 'var(--color-orange)' }}>
            {visits.length > 0
              ? `내원 환자 ${visits.length}명(이름·차트번호)을 읽었어요 — 저장하면 초진환자 해피콜의 초진·재초진 후보로 쓰여요.`
              : '결산표 아래 환자 목록(환자이름·차트번호)이 없어요 — 목록까지 함께 복사해야 초진환자 해피콜 후보로 쓸 수 있어요.'}
          </p>

          <div style={groupTitle}>예약</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <div>
              <label className="muted-text" style={label}>오늘 예약 환자수</label>
              {numberInput('reservationCount')}
            </div>
            <div>
              <label className="muted-text" style={label}>예약 정상 이행</label>
              {numberInput('keptCount')}
            </div>
            <div>
              <label className="muted-text" style={label}>예약 노쇼</label>
              {numberInput('noshowCount')}
            </div>
            <div>
              <label className="muted-text" style={label}>예약 취소</label>
              {numberInput('cancelCount')}
            </div>
            <div>
              <label className="muted-text" style={label}>다음예약 접수 환자수</label>
              {numberInput('nextBookingCount')}
              {receptionHint != null && (
                <p className="muted-text" style={{ fontSize: 11, margin: '4px 0 0' }}>
                  접수기록부에서 {receptionHint}명 자동 입력 (예약 체크 기준)
                </p>
              )}
            </div>
          </div>
          {outcomeMismatch && (
            <Warning>
              오늘 예약 {n('reservationCount')}명인데 정상 이행 + 노쇼 + 취소는 {outcomeSum}명이에요. 확인해 주세요.
            </Warning>
          )}

          <div style={groupTitle}>추나</div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
            <div>
              <label className="muted-text" style={label}>추나 인원</label>
              {numberInput('chunaCount')}
            </div>
            <div>
              <label className="muted-text" style={label}>추나 환자 이름</label>
              <input value={closing.chunaNames} onChange={(e) => setField('chunaNames', e.target.value)} className="input-field" placeholder="홍길동 성춘향 이몽룡" />
            </div>
          </div>
          {chunaMismatch && (
            <Warning>
              추나 인원은 {chunaMismatch.count}명인데 이름은 {chunaMismatch.names}명이에요. 확인해 주세요.
            </Warning>
          )}

          <div style={groupTitle}>제외환자</div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
            <div>
              <label className="muted-text" style={label}>제외환자 수</label>
              {numberInput('excludedCount')}
            </div>
            <div>
              <label className="muted-text" style={label}>제외환자 이름</label>
              <input value={closing.excludedNames} onChange={(e) => setField('excludedNames', e.target.value)} className="input-field" placeholder="강백호 서태웅" />
            </div>
          </div>
          {excludedMismatch && (
            <Warning>
              제외환자 수는 {excludedMismatch.count}명인데 이름은 {excludedMismatch.names}명이에요. 확인해 주세요.
            </Warning>
          )}

          <div style={groupTitle}>그 외 (멘트에 들어가요)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="muted-text" style={label}>한약·비급여 판매</label>
              <input value={closing.herbSales} onChange={(e) => setField('herbSales', e.target.value)} className="input-field" placeholder="일반한약15일 1명,녹용한약 1명" />
            </div>
            <div>
              <label className="muted-text" style={label}>네이버리뷰</label>
              {numberInput('naverReviewCount')}
            </div>
            <div>
              <label className="muted-text" style={label}>초진</label>
              {numberInput('firstVisitCount')}
            </div>
            <div>
              <label className="muted-text" style={label}>소개환 인원</label>
              {numberInput('referralCount')}
            </div>
            <div>
              <label className="muted-text" style={label}>소개환 이름</label>
              <input value={closing.referralNames} onChange={(e) => setField('referralNames', e.target.value)} className="input-field" />
            </div>
          </div>
          {referralMismatch && (
            <Warning>
              소개환 인원은 {referralMismatch.count}명인데 이름은 {referralMismatch.names}명이에요. 확인해 주세요.
            </Warning>
          )}

          <div style={groupTitle}>원장님께 보낼 멘트</div>
          <textarea
            value={message}
            readOnly
            rows={3}
            className="input-field"
            style={{ fontSize: 13, resize: 'vertical' }}
            aria-label="완성된 일일 결산 멘트"
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={handleSave} disabled={saving || invalidCells.length > 0} className="btn-primary" style={{ padding: '8px 20px', fontSize: 13 }}>
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={handleCopy}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 10,
                border: '1px solid var(--color-line)',
                background: 'var(--color-surface)',
                color: 'var(--color-ink)',
              }}
            >
              멘트 복사
            </button>
            <button
              onClick={handleClearAll}
              style={{
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 10,
                border: '1px solid var(--color-line)',
                background: 'var(--color-surface)',
                color: 'var(--color-error)',
              }}
            >
              입력칸 비우기
            </button>
            {copied && <span style={{ fontSize: 12, color: 'var(--color-teal-deep)' }}>복사했어요. 카톡에 붙여넣기 하세요.</span>}
          </div>
        </div>
      )}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
      {result && <p style={{ color: 'var(--color-teal-deep)', fontSize: 13, marginTop: 8 }}>{result}</p>}

      {history.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="muted-text" style={{ fontSize: 12, marginBottom: 6 }}>최근 저장 기록</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {history.map((h) => (
              <li key={h.date} className="muted-text" style={{ fontSize: 12, background: 'var(--color-surface-2)', borderRadius: 8, padding: '4px 10px' }}>
                {h.date} · {h.totalRevenue.toLocaleString()}원{h.visitCount != null ? ` · 내원 ${h.visitCount}명` : ''} · 저장 {formatSavedAt(h.updatedAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// 자주 쓰는 순서대로 — 일일결산(매일) → 예약 명단 → 월결산(월말에 한 번). 월결산은
// 맨 아래에 있어도 이번달 현황의 총매출·일평균 환자수를 가장 우선해서 결정한다.
export function PasteImportWidget() {
  const [reservationSync, setReservationSync] = useState<ReservationSync>({ version: 0, dates: [] });
  const [clearSignals, setClearSignals] = useState({ daily: 0, reservation: 0, monthly: 0 });
  // from 이외 칸들의 신호를 올려 그 칸들의 예전 결과 문구를 지운다.
  const outcomeFrom = (from: 'daily' | 'reservation' | 'monthly') => () =>
    setClearSignals((prev) => ({
      daily: from === 'daily' ? prev.daily : prev.daily + 1,
      reservation: from === 'reservation' ? prev.reservation : prev.reservation + 1,
      monthly: from === 'monthly' ? prev.monthly : prev.monthly + 1,
    }));
  return (
    <div>
      <DailySettlementSection reservationSync={reservationSync} clearSignal={clearSignals.daily} onOutcome={outcomeFrom('daily')} />
      <ReservationSection
        onSaved={(dates) => setReservationSync((prev) => ({ version: prev.version + 1, dates }))}
        clearSignal={clearSignals.reservation}
        onOutcome={outcomeFrom('reservation')}
      />
      <MonthlySettlementSection clearSignal={clearSignals.monthly} onOutcome={outcomeFrom('monthly')} />
    </div>
  );
}
