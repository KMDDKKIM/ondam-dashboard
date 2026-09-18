'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { analyzePasteText, type PasteAnalysis } from '@/lib/pasteImport';
import { upsertDailyRevenue, resetMonthRevenue } from '@/lib/supabase/dailyRevenue';

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function summarize(analysis: PasteAnalysis): string {
  if (analysis.format === 'reservation') {
    return analysis.groups.map((g) => `${g.date} 예약 ${g.rows.length}건`).join(' · ') + ' 확인됨';
  }
  if (analysis.format === 'daily') {
    return `${analysis.date ?? '(날짜 미지정)'} 매출 ${analysis.totalRevenue.toLocaleString()}원 (${analysis.rowCount}건 합계)`;
  }
  if (analysis.format === 'monthly') {
    return `${analysis.rows[0].date.slice(0, 7)} ${analysis.rows.length}일치 확인됨 (기존 기록 리셋)`;
  }
  return analysis.reason;
}

// 예약시트/당일결산/월결산표를 엑셀에서 복사해 그대로 붙여넣으면 헤더로 형식을
// 자동 판별해 예약관리(kh-ondam-reservation)에 등록하거나 이번달 현황의 매출을
// 갱신한다. 별도 페이지 없이 홈 화면에서 바로 쓸 수 있도록 작게 둔다.
export function PasteImportWidget() {
  const [text, setText] = useState('');
  const [fallbackDate, setFallbackDate] = useState(todayString());
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const supabase = createClient();

  const analysis = useMemo(() => (text.trim() ? analyzePasteText(text, fallbackDate) : null), [text, fallbackDate]);

  async function handleSave() {
    if (!analysis) return;
    setSaving(true);
    setError('');
    setResult('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (analysis.format === 'reservation') {
        const response = await fetch('/api/reservation-paste', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? '저장에 실패했습니다.');
        setResult(`예약관리에 저장했어요: ${(body.savedDates as string[]).join(', ')}`);
        setText('');
      } else if (analysis.format === 'daily') {
        if (!analysis.date) {
          setError('날짜를 찾지 못했습니다. 아래 날짜 입력란에서 지정해 주세요.');
          return;
        }
        await upsertDailyRevenue(supabase, analysis.date, analysis.totalRevenue, user?.id ?? null);
        setResult(`${analysis.date} 매출 ${analysis.totalRevenue.toLocaleString()}원을 이번달 현황에 반영했어요.`);
        setText('');
      } else if (analysis.format === 'monthly') {
        const month = analysis.rows[0].date.slice(0, 7);
        const ok = window.confirm(
          `${month}의 기존 일별 매출 기록을 지우고, 붙여넣은 ${analysis.rows.length}일치 값으로 다시 채웁니다. 계속할까요?`
        );
        if (!ok) return;
        await resetMonthRevenue(supabase, month, analysis.rows, user?.id ?? null);
        setResult(`${month} 매출을 월결산 기준 ${analysis.rows.length}일치로 리셋했어요.`);
        setText('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
        <span>📥</span>
        <span>예약·결산 붙여넣기</span>
        <span className="muted-text" style={{ fontWeight: 400, fontSize: 12 }}>
          — 예약시트/당일결산/월결산표를 엑셀에서 복사해 붙여넣으면 자동으로 들어가요
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="여기에 헤더 행을 포함해서 붙여넣으세요 (Ctrl+V)"
        className="input-field"
        style={{ minHeight: 64, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
      />

      {analysis?.format === 'daily' && !analysis.date && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="muted-text" style={{ fontSize: 12 }}>
            날짜를 못 찾았어요 →
          </span>
          <input
            type="date"
            value={fallbackDate}
            onChange={(e) => setFallbackDate(e.target.value)}
            className="input-field"
            style={{ maxWidth: 160, padding: '6px 10px' }}
          />
        </div>
      )}

      {(analysis || error || result) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          {analysis && (
            <span
              style={{ fontSize: 13, color: analysis.format === 'unknown' ? 'var(--color-error)' : 'var(--color-ink)' }}
            >
              {summarize(analysis)}
            </span>
          )}
          {analysis && analysis.format !== 'unknown' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
              style={{ padding: '6px 16px', fontSize: 13 }}
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          )}
          {error && <span className="error-text" style={{ margin: 0 }}>{error}</span>}
          {result && <span style={{ color: 'var(--color-teal-deep)', fontSize: 13 }}>{result}</span>}
        </div>
      )}
    </div>
  );
}
