'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { EXPORT_DATASETS } from '@/lib/backupExport';
import { currentMonthKst } from '@/lib/kst';

// 대표원장 전용 화면. 실제 자료는 /api/export 가 대표원장인지 다시 확인한 뒤에만 내려준다.
export default function BackupPage() {
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [month, setMonth] = useState(currentMonthKst());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const supabase = createClient();

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsOwner(false);
        return;
      }
      const { data: me } = await supabase.from('staff').select('role, status').eq('id', user.id).maybeSingle();
      setIsOwner(me?.role === 'owner' && me.status === 'approved');
    })().catch(() => setIsOwner(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function download(table: string) {
    const ds = EXPORT_DATASETS[table];
    if (ds.monthly && !/^\d{4}-\d{2}$/.test(month)) {
      setError('월을 골라주세요.');
      return;
    }
    setBusy(table);
    setError('');
    try {
      const query = new URLSearchParams({ table });
      if (ds.monthly) query.set('month', month);
      const response = await fetch(`/api/export?${query.toString()}`);
      // 세션이 끝나면 /api/export 가 /login 으로 넘어가 HTML 이 오는데, 그걸 CSV 로 저장하면 안 된다.
      if (response.redirected) {
        setError('로그인이 풀렸어요. 새로고침 후 다시 시도해 주세요.');
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? '내려받기에 실패했습니다.');
        return;
      }
      if (!response.headers.get('Content-Type')?.startsWith('text/csv')) {
        setError('로그인이 풀렸어요. 새로고침 후 다시 시도해 주세요.');
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `ondam-${table}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('내려받기에 실패했습니다. 네트워크 상태를 확인해주세요.');
    } finally {
      setBusy(null);
    }
  }

  if (isOwner === null) return <p className="muted-text">불러오는 중...</p>;
  if (!isOwner) return <p className="muted-text">대표원장만 볼 수 있는 화면이에요.</p>;

  const monthlyEntries = Object.entries(EXPORT_DATASETS).filter(([, ds]) => ds.monthly);
  const allEntries = Object.entries(EXPORT_DATASETS).filter(([, ds]) => !ds.monthly);

  function row(table: string, label: string, monthly: boolean) {
    return (
      <li
        key={table}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 0',
          borderBottom: '1px solid var(--color-line)',
        }}
      >
        <span style={{ flex: 1, fontWeight: 600 }}>
          {label}
          <span className="muted-text" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
            {monthly ? `${month} 한 달치` : '전체'}
          </span>
        </span>
        <button className="btn-primary" disabled={busy !== null} onClick={() => download(table)}>
          {busy === table ? '만드는 중...' : 'CSV 내려받기'}
        </button>
      </li>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>백업 내려받기</h1>
      <p className="muted-text" style={{ marginBottom: 6 }}>
        무료 요금제라 자동 백업이 없어요. 주 1회 이상 내려받아 보관하세요.
      </p>
      <p className="muted-text" style={{ marginBottom: 24, fontSize: 12 }}>
        엑셀에서 바로 열 수 있는 CSV 파일이에요. 환자 이름·연락처가 들어 있으니 안전한 곳에만 보관하세요. 주민등록번호는 포함되지 않아요.
      </p>
      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 15 }}>월별 자료</h2>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input-field"
            style={{ maxWidth: 170 }}
            aria-label="내려받을 달"
          />
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {monthlyEntries.map(([table, ds]) => row(table, ds.label, true))}
        </ul>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>전체 자료</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {allEntries.map(([table, ds]) => row(table, ds.label, false))}
        </ul>
      </div>
    </div>
  );
}
