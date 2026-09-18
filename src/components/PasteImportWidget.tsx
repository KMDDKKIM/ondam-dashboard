'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { analyzePasteText } from '@/lib/pasteImport';
import {
  upsertDailyRevenue,
  upsertMonthlyOverride,
  listRecentDailyRevenue,
  listRecentMonthlyOverrides,
  type MonthlyOverrideRow,
} from '@/lib/supabase/dailyRevenue';
import type { DailyRevenue } from '@/lib/types';

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function currentMonthString(): string {
  return todayString().slice(0, 7);
}

const sectionCardStyle = { padding: 16, marginBottom: 20 } as const;
const headerStyle = { display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 8, fontSize: 14 } as const;
const textareaStyle = { minHeight: 64, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' as const };

// ── 월결산 (가장 우선 표시) ──────────────────────────────────────────────
function MonthlySettlementSection() {
  const [month, setMonth] = useState(currentMonthString());
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

  useEffect(() => {
    if (analysis?.format === 'monthly') setMonth(analysis.month);
  }, [analysis]);

  const totalRevenue = analysis?.format === 'monthly' ? analysis.totalRevenue : null;
  const formatError = analysis && analysis.format !== 'monthly';

  async function handleSave() {
    if (totalRevenue == null) return;
    const ok = window.confirm(`${month}의 총매출을 ${totalRevenue.toLocaleString()}원으로 다시 채웁니다. 계속할까요?`);
    if (!ok) return;
    setSaving(true);
    setError('');
    setResult('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await upsertMonthlyOverride(supabase, month, totalRevenue, user?.id ?? null);
      setResult(`${month} 매출을 ${totalRevenue.toLocaleString()}원으로 저장했어요.`);
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
          — 이번달 현황의 총매출을 가장 우선해서 결정해요
        </span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label className="muted-text" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
          월
        </label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input-field" style={{ maxWidth: 160 }} />
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="월결산표를 여기에 붙여넣으세요 (Ctrl+V)"
        className="input-field"
        style={textareaStyle}
      />

      {formatError && <p className="error-text" style={{ marginTop: 8 }}>{analysis.format === 'unknown' ? analysis.reason : '월결산표가 아닌 것 같아요. 다른 칸에 붙여넣어 주세요.'}</p>}
      {totalRevenue != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>{month} 총매출 {totalRevenue.toLocaleString()}원 확인됨</span>
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
                {h.month} · {h.totalRevenue.toLocaleString()}원
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
function DailySettlementSection() {
  const [date, setDate] = useState(todayString());
  const [dateTouched, setDateTouched] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<DailyRevenue[]>([]);
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

  const analysis = useMemo(() => (text.trim() ? analyzePasteText(text, date) : null), [text, date]);

  useEffect(() => {
    if (analysis?.format === 'daily' && analysis.date && !dateTouched) setDate(analysis.date);
  }, [analysis, dateTouched]);

  const totalRevenue = analysis?.format === 'daily' ? analysis.totalRevenue : null;
  const formatError = analysis && analysis.format !== 'daily';

  async function handleSave() {
    if (totalRevenue == null) return;
    setSaving(true);
    setError('');
    setResult('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await upsertDailyRevenue(supabase, date, totalRevenue, user?.id ?? null);
      setResult(`${date} 매출 ${totalRevenue.toLocaleString()}원을 저장했어요.`);
      setText('');
      setDateTouched(false);
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
        <span>💴</span>
        <span>일일결산 입력</span>
        <span className="muted-text" style={{ fontWeight: 400, fontSize: 12 }}>
          — 매일 진료 끝나고 넣으면 그날 매출이 쌓여요
        </span>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label className="muted-text" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
          날짜
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setDateTouched(true);
          }}
          className="input-field"
          style={{ maxWidth: 160 }}
        />
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="일일 결산표를 여기에 붙여넣으세요 (Ctrl+V)"
        className="input-field"
        style={textareaStyle}
      />

      {formatError && <p className="error-text" style={{ marginTop: 8 }}>{analysis.format === 'unknown' ? analysis.reason : '일일 결산표가 아닌 것 같아요. 다른 칸에 붙여넣어 주세요.'}</p>}
      {totalRevenue != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13 }}>{date} 매출 {totalRevenue.toLocaleString()}원 확인됨</span>
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
                {h.date} · {h.totalRevenue.toLocaleString()}원
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// 월결산 → 예약 명단 → 일일결산 순서로 각각 따로 붙여넣는다. 월결산이 이번달
// 현황의 총매출을 가장 우선해서 결정하기 때문에 맨 위에 둔다.
export function PasteImportWidget() {
  return (
    <div>
      <MonthlySettlementSection />
      <ReservationSection />
      <DailySettlementSection />
    </div>
  );
}
