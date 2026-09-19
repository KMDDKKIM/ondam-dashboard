'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { analyzePasteText } from '@/lib/pasteImport';
import { buildClosingMessage, summarizePurchases } from '@/lib/closingMessage';
import { listPurchasesByDate } from '@/lib/supabase/nonCoveredPurchases';
import { computeDerivedStats } from '@/lib/reservations/reservationStats';
import {
  upsertDailyRevenue,
  upsertMonthlyOverride,
  listRecentDailyRevenue,
  listRecentMonthlyOverrides,
  type MonthlyOverrideRow,
} from '@/lib/supabase/dailyRevenue';
import type { DailyRevenue } from '@/lib/types';

const sectionCardStyle = { padding: 16, marginBottom: 20 } as const;
const headerStyle = { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 8, fontSize: 14 } as const;
const textareaStyle = { minHeight: 64, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' as const };

// ── 월결산 ──────────────────────────────────────────────────────────
// 월은 붙여넣은 결산표 제목("월말결산:2026-09")에서 읽어 오므로 따로 고르지 않는다.
function MonthlySettlementSection() {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<MonthlyOverrideRow[]>([]);
  const supabase = createClient();

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
  const formatError = analysis && analysis.format !== 'monthly';

  async function handleSave() {
    if (totalRevenue == null || !month) return;
    const ok = window.confirm(`${month}의 총매출을 ${totalRevenue.toLocaleString()}원으로 다시 채웁니다. 계속할까요?`);
    if (!ok) return;
    setSaving(true);
    setError('');
    setResult('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await upsertMonthlyOverride(supabase, month, totalRevenue, avgDailyVisits, user?.id ?? null);
      setResult(
        `${month} 매출을 ${totalRevenue.toLocaleString()}원${avgDailyVisits != null ? `, 일평균 환자수를 ${avgDailyVisits}명` : ''}으로 저장했어요.`
      );
      setText('');
      await loadHistory();
    } catch {
      setError('저장에 실패했습니다.');
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
          — 이번달 총매출·일평균 환자수를 일일결산 누적보다 우선해서 결정해요
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
      {totalRevenue != null && month && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>
            {month} 총매출 {totalRevenue.toLocaleString()}원
            {avgDailyVisits != null ? `, 일평균 환자수 ${avgDailyVisits}명` : ''} 확인됨
          </span>
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
              <li key={h.month} className="muted-text" style={{ fontSize: 12, background: 'var(--color-surface-2)', borderRadius: 8, padding: '4px 10px' }}>
                {h.month} · {h.totalRevenue.toLocaleString()}원{h.avgDailyVisits != null ? ` · 일평균 ${h.avgDailyVisits}명` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── 예약 명단 ─────────────────────────────────────────────────────────
function ReservationSection() {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<{ date: string; reservationCount: number }[]>([]);
  const supabase = createClient();

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
      const response = await fetch('/api/reservation-paste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? '저장에 실패했습니다.');
      setResult(`예약관리에 저장했어요: ${(body.savedDates as string[]).join(', ')}`);
      setText('');
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
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
                {h.date} · 예약 {h.reservationCount}건
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── 일일결산 ──────────────────────────────────────────────────────────
// 날짜는 붙여넣은 결산표의 "진료날짜"에서 읽어 오므로 따로 고르지 않는다. 저장과 함께
// 원장에게 보내는 "일일 마무리 멘트"를 만들어 주는 칸도 여기 있다(저장하지 않는 입력).
interface ClosingFields {
  excludedNames: string;
  reservationCount: string;
  chunaCount: string;
  chunaNames: string;
  herbSales: string;
  naverReviewCount: string;
  firstVisitCount: string;
  referralCount: string;
  referralNames: string;
}

const EMPTY_CLOSING: ClosingFields = {
  excludedNames: '',
  reservationCount: '',
  chunaCount: '',
  chunaNames: '',
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

function DailySettlementSection() {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<DailyRevenue[]>([]);
  const [closing, setClosing] = useState<ClosingFields>(EMPTY_CLOSING);
  const [copied, setCopied] = useState(false);
  const supabase = createClient();

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
  const formatError = analysis && analysis.format !== 'daily';
  const missingDate = analysis?.format === 'daily' && !analysis.date;

  // 새 결산표가 붙여넣어져 날짜가 정해지면, 그 날짜에 이미 저장된 예약 명단(예약 수·취소·추나)과
  // 비급여 판매, 결산표의 신규환자수로 마무리 멘트 칸을 미리 채운다. 직접 고칠 수 있다.
  useEffect(() => {
    if (!date) {
      setClosing(EMPTY_CLOSING);
      return;
    }
    let cancelled = false;
    (async () => {
      const next: ClosingFields = { ...EMPTY_CLOSING, firstVisitCount: newPatientCount ? String(newPatientCount) : '' };
      try {
        const response = await fetch(`/api/records/${encodeURIComponent(date)}`);
        const record = response.ok ? await response.json() : null;
        // 기록에 남아 있는 요약 숫자는 옛 마감 멘트 시절 값일 수 있어서, 저장된 예약 명단
        // (reservations)을 직접 세어 채운다. 취소한 사람이 제외환자다.
        if (record && Array.isArray(record.reservations) && record.reservations.length > 0) {
          const derived = computeDerivedStats(record.reservations);
          next.reservationCount = String(derived.reservationCount);
          next.excludedNames = derived.excludedNames.join(', ');
          next.chunaCount = String(derived.chunaCount);
          next.chunaNames = derived.chunaNames.join(', ');
        }
      } catch {
        // 예약 명단이 없어도 직접 입력하면 된다.
      }
      try {
        next.herbSales = summarizePurchases(await listPurchasesByDate(supabase, date));
      } catch {
        // 비급여 기록이 없어도 직접 입력하면 된다.
      }
      if (!cancelled) setClosing(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, newPatientCount]);

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

  function setField(key: keyof ClosingFields, value: string) {
    setClosing((prev) => ({ ...prev, [key]: value }));
    setCopied(false);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setError('복사하지 못했어요. 아래 멘트를 직접 선택해서 복사해 주세요.');
    }
  }

  async function handleSave() {
    if (totalRevenue == null || !date) return;
    setSaving(true);
    setError('');
    setResult('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await upsertDailyRevenue(supabase, date, totalRevenue, visitCount, user?.id ?? null);
      setResult(`${date} 매출 ${totalRevenue.toLocaleString()}원${visitCount != null ? `, 내원 ${visitCount}명` : ''}을 저장했어요.`);
      await loadHistory();
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const fieldLabel = { display: 'block', marginBottom: 4, fontSize: 12 } as const;

  return (
    <div className="card" style={sectionCardStyle}>
      <div style={headerStyle}>
        <span>💴</span>
        <span>일일결산 입력</span>
        <span className="muted-text" style={{ fontWeight: 400, fontSize: 12 }}>
          — 매일 진료 끝나고 넣으면 그날 매출·내원환자수가 쌓이고, 원장님께 보낼 마무리 멘트도 만들어져요
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setResult('');
          setError('');
        }}
        placeholder="일일 결산표를 여기에 붙여넣으세요 (Ctrl+V)"
        className="input-field"
        style={textareaStyle}
      />

      {formatError && <p className="error-text" style={{ marginTop: 8 }}>{analysis.format === 'unknown' ? analysis.reason : '일일 결산표가 아닌 것 같아요. 다른 칸에 붙여넣어 주세요.'}</p>}
      {missingDate && (
        <p className="error-text" style={{ marginTop: 8 }}>
          결산표에서 진료날짜를 찾지 못했어요. "진료날짜:YYYY-MM-DD" 줄이 함께 복사되도록 다시 붙여넣어 주세요.
        </p>
      )}

      {totalRevenue != null && date && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13 }}>
              {date} 매출 {totalRevenue.toLocaleString()}원{visitCount != null ? `, 내원 ${visitCount}명` : ''} 확인됨
            </span>
            <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ padding: '6px 16px', fontSize: 13 }}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>

          <div className="card" style={{ marginTop: 14, padding: 14, background: 'var(--color-surface-2)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>📝 일일 마무리 멘트</div>
            <p className="muted-text" style={{ fontSize: 12, marginBottom: 10 }}>
              예약 명단·비급여를 저장해 둔 날짜는 자동으로 채워져요. 아래 칸을 고치면 멘트가 바로 바뀌어요.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <div>
                <label className="muted-text" style={fieldLabel}>예약 환자 수</label>
                <input type="number" min={0} value={closing.reservationCount} onChange={(e) => setField('reservationCount', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="muted-text" style={fieldLabel}>추나 인원 (비우면 이름 수)</label>
                <input type="number" min={0} value={closing.chunaCount} onChange={(e) => setField('chunaCount', e.target.value)} className="input-field" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="muted-text" style={fieldLabel}>추나 환자 이름 (쉼표로 구분)</label>
                <input value={closing.chunaNames} onChange={(e) => setField('chunaNames', e.target.value)} className="input-field" placeholder="조현지, 변경은" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="muted-text" style={fieldLabel}>제외환자 이름</label>
                <input value={closing.excludedNames} onChange={(e) => setField('excludedNames', e.target.value)} className="input-field" placeholder="박혜진, 박나령" />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="muted-text" style={fieldLabel}>한약·비급여 판매</label>
                <input value={closing.herbSales} onChange={(e) => setField('herbSales', e.target.value)} className="input-field" placeholder="일반한약15일 1명,녹용한약 1명" />
              </div>
              <div>
                <label className="muted-text" style={fieldLabel}>네이버리뷰</label>
                <input type="number" min={0} value={closing.naverReviewCount} onChange={(e) => setField('naverReviewCount', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="muted-text" style={fieldLabel}>초진</label>
                <input type="number" min={0} value={closing.firstVisitCount} onChange={(e) => setField('firstVisitCount', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="muted-text" style={fieldLabel}>소개환 인원 (비우면 이름 수)</label>
                <input type="number" min={0} value={closing.referralCount} onChange={(e) => setField('referralCount', e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="muted-text" style={fieldLabel}>소개환 이름</label>
                <input value={closing.referralNames} onChange={(e) => setField('referralNames', e.target.value)} className="input-field" />
              </div>
            </div>

            <textarea
              value={message}
              readOnly
              rows={3}
              className="input-field"
              style={{ marginTop: 12, fontSize: 13, resize: 'vertical' }}
              aria-label="완성된 마무리 멘트"
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <button onClick={handleCopy} className="btn-primary" style={{ padding: '6px 16px', fontSize: 13 }}>
                멘트 복사
              </button>
              {copied && <span style={{ fontSize: 12, color: 'var(--color-teal-deep)' }}>복사했어요. 카톡에 붙여넣기 하세요.</span>}
            </div>
          </div>
        </>
      )}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
      {result && <p style={{ color: 'var(--color-teal-deep)', fontSize: 13, marginTop: 8 }}>{result}</p>}

      {history.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="muted-text" style={{ fontSize: 12, marginBottom: 6 }}>최근 저장 기록</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {history.map((h) => (
              <li key={h.date} className="muted-text" style={{ fontSize: 12, background: 'var(--color-surface-2)', borderRadius: 8, padding: '4px 10px' }}>
                {h.date} · {h.totalRevenue.toLocaleString()}원{h.visitCount != null ? ` · 내원 ${h.visitCount}명` : ''}
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
  return (
    <div>
      <DailySettlementSection />
      <ReservationSection />
      <MonthlySettlementSection />
    </div>
  );
}
