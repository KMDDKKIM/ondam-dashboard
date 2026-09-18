'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { analyzePasteText, type PasteAnalysis } from '@/lib/pasteImport';
import { upsertDailyRevenue, resetMonthRevenue } from '@/lib/supabase/dailyRevenue';

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const FORMAT_LABEL: Record<PasteAnalysis['format'], string> = {
  reservation: '📅 예약시트',
  daily: '💴 당일결산',
  monthly: '📆 월결산',
  unknown: '❓ 알 수 없음',
};

export default function PasteImportPage() {
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
          setError('날짜를 찾지 못했습니다. 위 날짜 입력란에서 지정해 주세요.');
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
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>엑셀 붙여넣기</h1>
      <p className="muted-text" style={{ marginBottom: 20 }}>
        OK차트의 예약목록 / 당일결산 / 월결산표를 엑셀에서 그대로 복사해 아래에 붙여넣으면 자동으로 알아보고
        저장합니다.
      </p>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="여기에 표를 붙여넣으세요 (Ctrl+V) — 헤더 행을 포함해서 붙여넣어 주세요."
          className="input-field"
          style={{ minHeight: 220, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
        />

        {analysis?.format === 'daily' && !analysis.date && (
          <div style={{ marginTop: 10 }}>
            <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
              표에서 날짜를 찾지 못했어요 — 직접 지정해 주세요
            </label>
            <input
              type="date"
              value={fallbackDate}
              onChange={(e) => setFallbackDate(e.target.value)}
              className="input-field"
              style={{ maxWidth: 180 }}
            />
          </div>
        )}

        {analysis && (
          <div className="card" style={{ marginTop: 16, padding: 16, background: 'var(--color-surface-2)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{FORMAT_LABEL[analysis.format]} 확인됨</div>

            {analysis.format === 'reservation' && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {analysis.groups.map((g) => (
                  <li key={g.date}>
                    {g.date} — 예약 {g.rows.length}건 (기존 목록을 대체합니다)
                  </li>
                ))}
              </ul>
            )}

            {analysis.format === 'daily' && (
              <p style={{ fontSize: 13, margin: 0 }}>
                {analysis.date ?? '(날짜 미지정)'} 매출 {analysis.totalRevenue.toLocaleString()}원 ({analysis.rowCount}건 합계)
              </p>
            )}

            {analysis.format === 'monthly' && (
              <>
                <p style={{ fontSize: 13, marginBottom: 6 }}>
                  {analysis.rows[0].date.slice(0, 7)} — {analysis.rows.length}일치 (기존 기록을 리셋합니다)
                </p>
                <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <tbody>
                      {analysis.rows.map((r) => (
                        <tr key={r.date} style={{ borderTop: '1px solid var(--color-line)' }}>
                          <td style={{ padding: '4px 8px' }}>{r.date}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.totalRevenue.toLocaleString()}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {analysis.format === 'unknown' && <p className="error-text" style={{ margin: 0 }}>{analysis.reason}</p>}
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        {result && <p style={{ color: 'var(--color-teal-deep)', fontSize: 13, marginTop: 10 }}>{result}</p>}

        <button
          onClick={handleSave}
          disabled={!analysis || analysis.format === 'unknown' || saving}
          className="btn-primary"
          style={{ marginTop: 16 }}
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
}
