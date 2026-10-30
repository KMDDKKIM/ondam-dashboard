'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDialog } from '@/lib/confirmDialog';
import { formatQueueTime } from '@/lib/herbQueue';
import { createClient } from '@/lib/supabase/client';
import { dismissPickup, listPendingPickupOrders, setPickupDate, type PickupOrder } from '@/lib/supabase/herbPickup';

const REFRESH_MS = 30_000;
const cellStyle = { border: '1px solid #ddd', padding: '4px 6px', fontSize: 14 } as const;

function monthDay(date: string): string {
  const m = date.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : date;
}

// 처방전 출력을 마친 한약 — 데스크가 수령예정일을 넣으면 그 날짜 기준으로 해피콜(수령확인·중간상담)이 만들어진다
// (원장 결정, 2026-10-14: 금요일에 출력하고 월요일에 달이는 경우처럼 출력일과 수령일이 다를 수 있어서 수령예정일을 따로 받는다).
export function PickupPending() {
  const supabase = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setOrders(await listPendingPickupOrders(supabase));
      setError('');
    } catch {
      setError('수령예정일 입력 대기를 불러오지 못했어요. (한약 해피콜 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    } finally {
      setLoaded(true);
    }
  }, [supabase]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  async function submit(order: PickupOrder) {
    const date = dates[order.id];
    if (!date || busyId) return;
    setBusyId(order.id);
    setError('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const result = await setPickupDate(supabase, order.id, date, user?.id ?? null);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      setNotice(
        result.duplicate
          ? `${order.patientName}님: 같은 날 같은 수령예정일의 처방전이 이미 있어서 해피콜은 새로 만들지 않았어요.`
          : result.calls.length > 0
            ? `${order.patientName}님 해피콜을 만들었어요 — ${result.calls.map((c) => `${monthDay(c.callDate)} ${c.note.replace('한약 ', '')}`).join(' · ')}`
            : `${order.patientName}님 수령예정일을 저장했어요(며칠분을 몰라 중간상담은 만들지 않았어요).`
      );
    } catch {
      setError('저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(order: PickupOrder) {
    if (!(await confirmDialog(`${order.patientName}님 처방전을 수령예정일 입력 대기에서 뺄까요? (해피콜은 만들어지지 않아요)`, { confirmLabel: '빼기' }))) return;
    try {
      await dismissPickup(supabase, order.id);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch {
      setError('빼지 못했어요.');
    }
  }

  if (loaded && orders.length === 0 && !notice && !error) return null;

  return (
    <div className="card" style={{ padding: 12, marginBottom: 16, borderLeft: orders.length > 0 ? '4px solid var(--color-error)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>📦 수령예정일 입력 대기</span>
        {orders.length > 0 && <span style={{ fontWeight: 700, color: 'var(--color-error)' }}>{orders.length}건</span>}
      </div>
      <p className="muted-text" style={{ margin: '0 0 8px', fontSize: 13 }}>
        처방전 출력이 끝난 한약이에요. 수령예정일을 넣으면 <b>수령예정일 +1일</b>에 수령확인, <b>며칠분에 맞춰</b>(10일분 8일차 · 15일분 12일차 · 30일분 25일차) 중간상담 해피콜이 만들어져요.
      </p>
      {notice && <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--color-green)', fontWeight: 600 }}>✔ {notice}</p>}
      {error && <p className="error-text" style={{ margin: '0 0 8px' }}>{error}</p>}
      {orders.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
            <thead>
              <tr style={{ background: '#fdf0ee' }}>
                {['출력 시각', '환자 성함', '차트번호', '처방일 · 며칠분', '수령예정일', ''].map((h, i) => (
                  <th key={`${h}-${i}`} style={{ ...cellStyle, fontSize: 13, textAlign: 'center' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td style={{ ...cellStyle, textAlign: 'center', fontSize: 12, color: '#666' }}>{formatQueueTime(o.printedAt)}</td>
                  <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 600 }}>{o.patientName}</td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>{o.chartNo || '-'}</td>
                  <td style={{ ...cellStyle, textAlign: 'center' }}>
                    {monthDay(o.orderDate)} · {o.days > 0 ? `${o.days}일분` : '며칠분 없음'}
                  </td>
                  <td style={cellStyle}>
                    <input
                      type="date"
                      value={dates[o.id] ?? ''}
                      onChange={(e) => setDates((d) => ({ ...d, [o.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submit(o);
                      }}
                      aria-label={`${o.patientName} 수령예정일`}
                      style={{ fontSize: 14, padding: '2px 4px', width: '100%' }}
                    />
                  </td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap', textAlign: 'center' }}>
                    <button type="button" className="btn-primary" disabled={!dates[o.id] || busyId === o.id} onClick={() => submit(o)} style={{ padding: '3px 12px', fontSize: 13 }}>
                      {busyId === o.id ? '저장 중…' : '입력'}
                    </button>{' '}
                    <button type="button" onClick={() => dismiss(o)} style={{ fontSize: 12, padding: '2px 8px', color: '#b3261e' }}>
                      제외
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
