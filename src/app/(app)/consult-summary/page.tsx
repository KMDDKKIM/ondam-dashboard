'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listConsultSummaries,
  createConsultSummary,
  updateConsultSummary,
} from '@/lib/supabase/consultSummaries';
import type { ConsultSummary } from '@/lib/types';

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function ConsultSummaryPage() {
  const [records, setRecords] = useState<ConsultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [patientName, setPatientName] = useState('');
  const [consultDate, setConsultDate] = useState(todayString());
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  async function load() {
    setLoading(true);
    setError('');
    try {
      setRecords(await listConsultSummaries(supabase));
    } catch {
      setError('불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSummarize() {
    if (!transcript.trim()) return;
    setSummarizing(true);
    setError('');
    try {
      const response = await fetch('/api/consult-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? '요약에 실패했습니다.');
      setSummary(body.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : '요약에 실패했습니다.');
    } finally {
      setSummarizing(false);
    }
  }

  async function handleSave() {
    if (!patientName.trim() || !transcript.trim() || !summary.trim()) return;
    setSaving(true);
    setError('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createConsultSummary(supabase, {
        patientName: patientName.trim(),
        consultDate,
        transcript,
        summary,
        createdBy: user?.id ?? null,
      });
      setPatientName('');
      setConsultDate(todayString());
      setTranscript('');
      setSummary('');
      await load();
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSaved(id: string, value: string) {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, summary: value } : r)));
    try {
      await updateConsultSummary(supabase, id, value);
    } catch {
      setError('수정 사항을 저장하지 못했습니다.');
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return records;
    return records.filter((r) => r.patientName.includes(q));
  }, [search, records]);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>상담 녹음 차팅</h1>
      <p className="muted-text" style={{ marginBottom: 20 }}>
        티로 등으로 녹음한 상담 내용을 붙여넣으면 AI가 차팅 형식으로 정리해줘요. 결과는 저장 전에 직접 고칠
        수 있어요.
      </p>

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            placeholder="환자 성함"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="input-field"
            style={{ maxWidth: 160 }}
          />
          <input
            type="date"
            value={consultDate}
            onChange={(e) => setConsultDate(e.target.value)}
            className="input-field"
            style={{ maxWidth: 160 }}
          />
        </div>

        <label className="muted-text" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
          상담 녹음 내용 (붙여넣기)
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="티로에서 복사한 상담 내용을 여기에 붙여넣으세요"
          className="input-field"
          style={{ minHeight: 140, fontSize: 13, resize: 'vertical', marginBottom: 10 }}
        />

        <button onClick={handleSummarize} disabled={!transcript.trim() || summarizing} className="btn-primary" style={{ marginBottom: 16 }}>
          {summarizing ? '요약 중...' : '🩺 차팅 생성'}
        </button>

        {summary && (
          <>
            <label className="muted-text" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
              차팅 결과 (저장 전 수정 가능)
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="input-field"
              style={{ minHeight: 220, fontSize: 13, fontFamily: 'monospace', resize: 'vertical', marginBottom: 12 }}
            />
            <button onClick={handleSave} disabled={!patientName.trim() || saving} className="btn-primary">
              {saving ? '저장 중...' : '저장'}
            </button>
          </>
        )}

        {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>저장된 차팅</h2>
        <input
          placeholder="환자명 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field"
          style={{ maxWidth: 200 }}
        />
      </div>

      {loading ? (
        <p className="muted-text">불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p className="muted-text">기록이 없어요.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((r) => (
            <div key={r.id} className="card" style={{ padding: 16 }}>
              <button
                onClick={() => setExpandedId((prev) => (prev === r.id ? null : r.id))}
                style={{
                  display: 'flex',
                  width: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                <span>
                  {r.patientName} <span className="muted-text" style={{ fontWeight: 400 }}>· {r.consultDate}</span>
                </span>
                <span className="muted-text">{expandedId === r.id ? '접기 ▲' : '펼치기 ▼'}</span>
              </button>
              {expandedId === r.id && (
                <textarea
                  defaultValue={r.summary}
                  onBlur={(e) => handleEditSaved(r.id, e.target.value)}
                  className="input-field"
                  style={{ marginTop: 12, minHeight: 200, fontSize: 13, fontFamily: 'monospace' }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
