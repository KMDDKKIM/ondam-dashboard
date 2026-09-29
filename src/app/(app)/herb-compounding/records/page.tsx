'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDialog } from '@/lib/confirmDialog';
import { createClient } from '@/lib/supabase/client';
import { deleteHerbCompoundingOrder, listRecentHerbCompoundingOrders, type HerbCompoundingSummary } from '@/lib/supabase/herbCompounding';

export default function HerbCompoundingRecordsPage() {
  const [records, setRecords] = useState<HerbCompoundingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const supabase = createClient();
      setRecords(await listRecentHerbCompoundingOrders(supabase));
    } catch {
      setErrorMessage('기록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecords();
  }, [loadRecords]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return records;
    return records.filter((r) => r.patientName.includes(q) || r.chartNo.includes(q));
  }, [records, query]);

  async function handleDelete(id: string) {
    if (!(await confirmDialog('이 처방전 기록을 삭제할까요?'))) return;
    try {
      await deleteHerbCompoundingOrder(createClient(), id);
      await loadRecords();
    } catch {
      setErrorMessage('삭제에 실패했습니다.');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>한약 처방전 — 과거 기록</h2>
        <Link href="/herb-compounding" className="muted-text">
          새 처방전 쓰기
        </Link>
      </div>

      <input
        className="input-field"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="환자명·차트번호로 검색"
        style={{ marginBottom: 14, maxWidth: 320 }}
      />

      {errorMessage && <p className="error-text">{errorMessage}</p>}

      {loading ? (
        <p className="muted-text">불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p className="muted-text">저장된 처방전이 없어요.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>날짜</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>환자명</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>차트번호</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>첩수</th>
              <th style={{ textAlign: 'left', padding: '6px 8px' }}>약재 수</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--color-line)' }}>
                <td style={{ padding: '6px 8px' }}>{r.orderDate}</td>
                <td style={{ padding: '6px 8px' }}>{r.patientName || '(이름 없음)'}</td>
                <td style={{ padding: '6px 8px' }}>{r.chartNo || '-'}</td>
                <td style={{ padding: '6px 8px' }}>{r.packetCount}첩</td>
                <td style={{ padding: '6px 8px' }}>{r.herbCount}종</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Link href={`/herb-compounding?load=${r.id}`} className="muted-text">
                    불러오기/인쇄
                  </Link>
                  <button type="button" onClick={() => handleDelete(r.id)} style={{ padding: '3px 8px', fontSize: 12 }}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
