'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Staff } from '@/lib/types';

interface StaffRow extends Staff {
  status: 'pending' | 'approved';
}

export default function StaffApprovalPage() {
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [pending, setPending] = useState<StaffRow[]>([]);
  const [approved, setApproved] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const supabase = createClient();

  async function load() {
    setLoading(true);
    setError('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: me } = await supabase
        .from('staff')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      const owner = me?.role === 'owner';
      setIsOwner(owner);
      if (!owner) return;

      const { data, error: listError } = await supabase
        .from('staff')
        .select('id, name, role, status')
        .order('name');
      if (listError) {
        setError(listError.message);
        return;
      }
      const rows = (data ?? []) as StaffRow[];
      setPending(rows.filter((r) => r.status === 'pending'));
      setApproved(rows.filter((r) => r.status === 'approved'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleApprove(staffId: string) {
    setApprovingId(staffId);
    setError('');
    try {
      const response = await fetch('/api/staff/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? '승인에 실패했습니다.');
        return;
      }
      await load();
    } finally {
      setApprovingId(null);
    }
  }

  if (loading) return <p>불러오는 중...</p>;
  if (!isOwner) return <p>원장만 볼 수 있는 화면이에요.</p>;

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>직원 승인</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>승인 대기 중 ({pending.length}명)</h2>
      {pending.length === 0 ? (
        <p style={{ color: '#888', marginBottom: 24 }}>대기 중인 가입 신청이 없어요.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginBottom: 24 }}>
          {pending.map((s) => (
            <li
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 0',
                borderBottom: '1px solid #eee',
              }}
            >
              <span style={{ flex: 1 }}>{s.name}</span>
              <button onClick={() => handleApprove(s.id)} disabled={approvingId === s.id}>
                승인
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>사용 중인 계정 ({approved.length}명)</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {approved.map((s) => (
          <li key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
            {s.name} <span style={{ color: '#888' }}>({s.role === 'owner' ? '원장' : '직원'})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
