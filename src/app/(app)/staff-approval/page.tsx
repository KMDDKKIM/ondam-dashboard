'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Staff } from '@/lib/types';
import { ASSIGNABLE_GRADES, DEFAULT_GRADE, type AssignableGrade, type StaffGrade } from '@/lib/staffGrade';

interface StaffRow extends Staff {
  status: 'pending' | 'approved';
  grade: StaffGrade;
}

const removeButtonStyle = {
  padding: '6px 14px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid var(--color-error)',
  background: 'transparent',
  color: 'var(--color-error)',
  cursor: 'pointer',
} as const;

export default function StaffApprovalPage() {
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [pending, setPending] = useState<StaffRow[]>([]);
  const [approved, setApproved] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [pendingGrades, setPendingGrades] = useState<Record<string, AssignableGrade>>({});
  const [changingId, setChangingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
        .select('id, name, role, status, grade')
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
        body: JSON.stringify({ staffId, grade: pendingGrades[staffId] ?? DEFAULT_GRADE }),
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

  async function handleGradeChange(staffId: string, grade: AssignableGrade) {
    setChangingId(staffId);
    setError('');
    try {
      const response = await fetch('/api/staff/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, grade }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? '등급을 바꾸지 못했습니다.');
        return;
      }
      await load();
    } finally {
      setChangingId(null);
    }
  }

  async function handleRemove(staff: StaffRow) {
    const message =
      staff.status === 'pending'
        ? `"${staff.name}" 님의 가입 신청을 거절할까요?`
        : `"${staff.name}" 님을 삭제할까요?\n계정이 삭제되어 로그인할 수 없게 됩니다. 이 직원이 남긴 기록은 남고 작성자 이름만 지워져요.`;
    if (!await confirmDialog(message)) {
      return;
    }
    setRemovingId(staff.id);
    setError('');
    try {
      const response = await fetch('/api/staff/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: staff.id }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? '삭제에 실패했습니다.');
        return;
      }
      await load();
    } catch {
      setError('삭제에 실패했습니다. 네트워크 상태를 확인해주세요.');
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) return <p className="muted-text">불러오는 중...</p>;
  if (!isOwner) return <p className="muted-text">원장만 볼 수 있는 화면이에요.</p>;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>직원 승인</h1>
      <p className="muted-text" style={{ marginBottom: 24 }}>
        가입 신청한 직원을 확인하고 승인하세요.
      </p>
      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>승인 대기 중 ({pending.length}명)</h2>
        {pending.length === 0 ? (
          <p className="muted-text">대기 중인 가입 신청이 없어요.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {pending.map((s) => (
              <li
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--color-line)',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: 'var(--color-surface-2)',
                    fontSize: 13,
                  }}
                >
                  🙋
                </span>
                <span style={{ flex: 1, fontWeight: 600 }}>{s.name}</span>
                <select
                  className="input-field"
                  value={pendingGrades[s.id] ?? DEFAULT_GRADE}
                  onChange={(event) =>
                    setPendingGrades((prev) => ({ ...prev, [s.id]: event.target.value as AssignableGrade }))
                  }
                  style={{ width: 100, padding: '6px 10px' }}
                  aria-label={`${s.name} 등급`}
                >
                  {ASSIGNABLE_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleApprove(s.id)}
                  disabled={approvingId === s.id}
                  className="btn-primary"
                  style={{ padding: '6px 14px', fontSize: 13 }}
                >
                  승인
                </button>
                <button
                  onClick={() => handleRemove(s)}
                  disabled={removingId === s.id || approvingId === s.id}
                  style={removeButtonStyle}
                >
                  신청 거절
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>사용 중인 계정 ({approved.length}명)</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {approved.map((s) => (
            <li
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid var(--color-line)',
              }}
            >
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              {s.role === 'owner' ? (
                <span className="muted-text">대표원장</span>
              ) : (
                <>
                  <select
                    className="input-field"
                    value={s.grade}
                    disabled={changingId === s.id}
                    onChange={(event) => handleGradeChange(s.id, event.target.value as AssignableGrade)}
                    style={{ width: 100, padding: '6px 10px' }}
                    aria-label={`${s.name} 등급`}
                  >
                    {ASSIGNABLE_GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleRemove(s)}
                    disabled={removingId === s.id}
                    style={{ ...removeButtonStyle, marginLeft: 'auto' }}
                  >
                    삭제
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
