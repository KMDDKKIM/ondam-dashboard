'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getVisitHistorySummary, upsertVisitHistory, type VisitHistorySummary } from '@/lib/supabase/patientVisitHistory';
import { parseVisitHistory } from '@/lib/visitHistoryImport';

interface Props {
  /** 가져온 뒤 후보 목록을 다시 불러오게 한다 */
  onDone?: () => void;
}

// OK차트 "내원일수/진료비 분석" 표를 붙여넣어 환자별 내원 이력(처음·마지막 내원일, 차트 등록일)을 저장한다.
// 초진환자 해피콜의 초진·재초진 판정이 이 이력으로 정확해진다(3개월 안에 온 적 있으면 재진, 예전 차트인데 없으면 재초진).
export function VisitHistoryImport({ onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<VisitHistorySummary | null>(null);

  const parsed = useMemo(() => (text.trim() ? parseVisitHistory(text) : null), [text]);

  async function loadSummary() {
    try {
      setSummary(await getVisitHistorySummary(createClient()));
    } catch {
      setSummary(null);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  async function handleImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await upsertVisitHistory(createClient(), parsed.rows, { start: parsed.periodStart, end: parsed.periodEnd });
      setMessage(`${parsed.rows.length}명의 내원 이력을 저장했어요.`);
      setText('');
      await loadSummary();
      onDone?.();
    } catch {
      setError('저장하지 못했어요. (환자 내원 이력 테이블을 만드는 SQL을 먼저 실행했는지 확인해 주세요)');
    } finally {
      setBusy(false);
    }
  }

  const noPeriod = parsed && (!parsed.periodStart || !parsed.periodEnd);

  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ border: 'none', background: 'transparent', color: 'var(--color-ink)', fontWeight: 700, fontSize: 14, padding: 0 }}
      >
        🗂️ 내원 이력 가져오기 (초진·재초진 판정용) {open ? '▲' : '▼'}
      </button>
      {summary && summary.count > 0 && (
        <span className="muted-text" style={{ fontSize: 12, marginLeft: 8 }}>
          저장된 환자 {summary.count}명 · {summary.periodStart} ~ {summary.periodEnd}
        </span>
      )}

      {open && (
        <div style={{ marginTop: 10 }}>
          <p className="muted-text" style={{ marginBottom: 8, fontSize: 12 }}>
            OK차트의 &quot;내원일수/진료비 분석&quot; 표(기간 중 내원한 환자 목록)를 제목과 머리글부터 통째로 복사해 붙여넣으세요. 이름·차트번호·연락처·차트 등록일·처음/마지막
            내원일만 저장하고, 주소·진료비 등은 저장하지 않아요. 같은 차트번호는 새 값으로 바뀌어요. 최근 3개월치를 넣어 두면, 그 기간에 온 적 없는 예전 차트 환자를
            재초진으로 알아낼 수 있어요.
          </p>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setMessage('');
              setError('');
            }}
            placeholder="내원일수/진료비 분석 표를 붙여넣으세요 (Ctrl+V)"
            className="input-field"
            style={{ minHeight: 70, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
          />
          {text.trim() && !parsed && (
            <p className="error-text" style={{ marginTop: 6 }}>
              내원일수/진료비 분석 표로 보이지 않아요. 머리글(이름, 차트번호, … 기간중최초, 기간중최근)까지 함께 복사해 주세요.
            </p>
          )}
          {parsed && (
            <>
              <p style={{ fontSize: 13, marginTop: 8, fontWeight: 600 }}>
                환자 {parsed.rows.length}명 · 기간 {parsed.periodStart ?? '?'} ~ {parsed.periodEnd ?? '?'}
                {!parsed.periodFromTitle && parsed.periodStart ? ' (제목이 없어 내원일로 추정)' : ''}
              </p>
              {noPeriod && <p className="error-text">분석 기간을 알 수 없어요. 제목 줄(&quot;… 분석:2026-06-21~2026-09-21&quot;)까지 함께 복사해 주세요.</p>}
              <button
                type="button"
                onClick={handleImport}
                disabled={busy || parsed.rows.length === 0 || !!noPeriod}
                className="btn-primary"
                style={{ padding: '8px 18px', fontSize: 13, marginTop: 6 }}
              >
                {busy ? '저장 중...' : `${parsed.rows.length}명 저장`}
              </button>
            </>
          )}
          {message && <p style={{ color: 'var(--color-teal-deep)', fontSize: 13, marginTop: 8 }}>{message}</p>}
          {error && <p className="error-text" style={{ marginTop: 6 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
