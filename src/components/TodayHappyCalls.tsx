'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listPendingHerbCalls,
  listPendingDietCalls,
  listPendingManualEntries,
  markHerbCallDone,
  markDietCallDone,
  markManualEntryDone,
} from '@/lib/supabase/happyCallQueue';

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Row =
  | { kind: 'herb'; id: string; patientName: string; callDate: string; callNumber: 1 | 2 | 3; prescriptionId: string }
  | { kind: 'diet'; id: string; patientName: string; callDate: string }
  | { kind: 'manual'; id: string; patientName: string; callDate: string; note: string | null };

const kindLabel: Record<Row['kind'], string> = { herb: '한약', diet: '린다이어트', manual: '초진/비급여' };

export function TodayHappyCalls() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const supabase = createClient();
  const today = todayISO();

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [herb, diet, manual] = await Promise.all([
        listPendingHerbCalls(supabase, today),
        listPendingDietCalls(supabase, today),
        listPendingManualEntries(supabase, today),
      ]);
      const next: Row[] = [
        ...herb.flatMap((p) => {
          const items: Row[] = [];
          if (!p.call1Done && p.callDate1 <= today)
            items.push({ kind: 'herb', id: `${p.id}-1`, patientName: p.patientName, callDate: p.callDate1, callNumber: 1, prescriptionId: p.id });
          if (!p.call2Done && p.callDate2 <= today)
            items.push({ kind: 'herb', id: `${p.id}-2`, patientName: p.patientName, callDate: p.callDate2, callNumber: 2, prescriptionId: p.id });
          if (!p.call3Done && p.callDate3 <= today)
            items.push({ kind: 'herb', id: `${p.id}-3`, patientName: p.patientName, callDate: p.callDate3, callNumber: 3, prescriptionId: p.id });
          return items;
        }),
        ...diet.map((c) => ({ kind: 'diet' as const, id: c.id, patientName: c.patientName, callDate: c.callDate })),
        ...manual.map((m) => ({ kind: 'manual' as const, id: m.id, patientName: m.patientName, callDate: m.callDate, note: m.note })),
      ].sort((a, b) => a.callDate.localeCompare(b.callDate));
      setRows(next);
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

  async function complete(row: Row) {
    const note = window.prompt('통화 메모 (선택)');
    if (note === null) return;
    try {
      if (row.kind === 'herb') await markHerbCallDone(supabase, row.prescriptionId, row.callNumber, note);
      else if (row.kind === 'diet') await markDietCallDone(supabase, row.id, note);
      else await markManualEntryDone(supabase, row.id, note);
      await load();
    } catch {
      setError('처리에 실패했습니다.');
    }
  }

  const overdueCount = rows.filter((r) => r.callDate < today).length;

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <span>📞</span>
          <span>오늘의 해피콜</span>
        </div>
        <a href="/happy-call-list" className="muted-text" style={{ fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          전체 목록 →
        </a>
      </div>
      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <p className="muted-text">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <p className="muted-text">오늘 해피콜 대상이 없어요.</p>
      ) : (
        <>
          {overdueCount > 0 && (
            <p style={{ color: 'var(--color-error)', fontSize: 12, marginBottom: 8 }}>지난 예정일 {overdueCount}건 포함</p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rows.map((row) => (
              <li
                key={row.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 0',
                  borderBottom: '1px solid var(--color-line)',
                }}
              >
                <span
                  className="muted-text"
                  style={{ fontSize: 11, fontWeight: 700, minWidth: 44, textAlign: 'center' }}
                >
                  {kindLabel[row.kind]}
                </span>
                <span style={{ flex: 1, fontSize: 14 }}>
                  {row.patientName}
                  {row.kind === 'manual' && row.note ? <span className="muted-text"> · {row.note}</span> : ''}
                </span>
                <span
                  className="muted-text"
                  style={{ fontSize: 12, color: row.callDate < today ? 'var(--color-error)' : undefined }}
                >
                  {row.callDate}
                </span>
                <button
                  onClick={() => complete(row)}
                  style={{
                    border: '1px solid var(--color-line)',
                    background: 'var(--color-surface-2)',
                    borderRadius: 8,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  완료
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
