'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listRemoteConsultRequests,
  setRemoteMemo,
  setRemoteStatus,
  type RemoteConsultRequest,
} from '@/lib/supabase/remoteConsult';
import { STATUS_LABEL, maskRrn, type RemoteStatus } from '@/lib/remoteConsult';
import { formatSavedAt } from '@/lib/savedAt';
import type { Staff } from '@/lib/types';

type Filter = RemoteStatus | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'new', label: '대기' },
  { key: 'success', label: '성공' },
  { key: 'fail', label: '실패' },
  { key: 'absent', label: '부재' },
  { key: 'all', label: '전체' },
];

const STATUS_STYLE: Record<RemoteStatus, { bg: string; fg: string }> = {
  new: { bg: 'rgba(239, 138, 62, 0.16)', fg: 'var(--color-orange)' },
  success: { bg: 'rgba(79, 174, 106, 0.16)', fg: 'var(--color-green)' },
  fail: { bg: 'rgba(209, 69, 59, 0.14)', fg: 'var(--color-error)' },
  absent: { bg: 'var(--color-surface-2)', fg: 'var(--color-muted)' },
};

const ACTIONS: { status: RemoteStatus; label: string }[] = [
  { status: 'success', label: '성공' },
  { status: 'fail', label: '실패' },
  { status: 'absent', label: '부재' },
];

// 구글폼으로 들어온 비대면진료 신청 목록. 새 신청은 "대기"로 뜨고, 처리하면 성공/실패/부재를 눌러 표시한다
// (예전 시트의 행 색깔을 대신한다). 주민번호는 가려 두고 "주민번호 보기"를 눌러야 잠깐 펼쳐진다.
export default function RemoteConsultAlertsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<RemoteConsultRequest[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('new');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  async function load() {
    setError('');
    try {
      const [rows, staff, user] = await Promise.all([
        listRemoteConsultRequests(supabase),
        supabase.from('staff').select('id, name, role'),
        supabase.auth.getUser(),
      ]);
      setItems(rows);
      setStaffList((staff.data ?? []) as Staff[]);
      setMe(user.data.user?.id ?? null);
    } catch {
      setError('불러오지 못했습니다. (비대면진료 테이블이 아직 만들어지지 않았을 수 있어요)');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const staffName = (id: string | null) => (id ? (staffList.find((s) => s.id === id)?.name ?? '') : '');
  const visible = items.filter((r) => filter === 'all' || r.status === filter);
  const countOf = (key: Filter) => items.filter((r) => key === 'all' || r.status === key).length;

  async function changeStatus(r: RemoteConsultRequest, status: RemoteStatus) {
    setError('');
    try {
      await setRemoteStatus(supabase, r.id, status, me);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리에 실패했습니다.');
    }
  }

  async function saveMemo(r: RemoteConsultRequest, memo: string) {
    if (memo === r.memo) return;
    try {
      await setRemoteMemo(supabase, r.id, memo);
      setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, memo } : x)));
    } catch {
      setError('메모를 저장하지 못했습니다.');
    }
  }

  async function reveal(id: string) {
    setError('');
    try {
      const response = await fetch(`/api/remote-consult/${id}/rrn`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? '불러오지 못했어요.');
      setRevealed((prev) => ({ ...prev, [id]: body.rrn as string }));
      // 20초 뒤 다시 가린다.
      clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => {
        setRevealed((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 20000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '주민번호를 불러오지 못했어요.');
    }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>📨 비대면진료 신청</h1>
      <p className="muted-text" style={{ marginBottom: 16 }}>
        구글폼으로 들어온 신청이 자동으로 여기에 떠요. 처리하면 성공·실패·부재를 눌러 표시하세요.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid var(--color-line)',
              background: filter === key ? 'var(--color-brand-b)' : 'var(--color-surface)',
              color: filter === key ? '#fff' : 'var(--color-ink)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {label} {countOf(key)}
          </button>
        ))}
        <button
          onClick={load}
          style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 999, border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-ink)', fontSize: 13 }}
        >
          ↻ 새로고침
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <p className="muted-text">불러오는 중...</p>
      ) : visible.length === 0 ? (
        <p className="muted-text">해당하는 신청이 없어요.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {visible.map((r) => {
            const style = STATUS_STYLE[r.status];
            return (
              <div key={r.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <strong style={{ fontSize: 16 }}>{r.patientName || '(이름 없음)'}</strong>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 10, background: style.bg, color: style.fg }}>
                    {STATUS_LABEL[r.status]}
                  </span>
                  <span className="muted-text" style={{ fontSize: 12 }}>
                    신청 {formatSavedAt(r.submittedAt)}
                    {r.status !== 'new' && r.handledAt ? ` · 처리 ${formatSavedAt(r.handledAt)}${staffName(r.handledBy) ? ` (${staffName(r.handledBy)})` : ''}` : ''}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '4px 16px', fontSize: 13, marginBottom: 8 }}>
                  <div>
                    <span className="muted-text">연락처 </span>
                    {r.phone || '-'}
                  </div>
                  <div>
                    <span className="muted-text">주민번호 </span>
                    <span style={{ fontFamily: 'monospace' }}>{revealed[r.id] ?? maskRrn(r.rrnPrefix)}</span>{' '}
                    {r.rrnPrefix && !revealed[r.id] && (
                      <button
                        type="button"
                        onClick={() => reveal(r.id)}
                        style={{ border: 'none', background: 'transparent', color: 'var(--color-blue)', fontSize: 12, fontWeight: 600, padding: 0 }}
                      >
                        보기
                      </button>
                    )}
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span className="muted-text">택배 주소 </span>
                    {r.address || '-'}
                  </div>
                </div>

                {(r.service || r.answers.length > 0) && (
                  <div style={{ background: 'var(--color-surface-2)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>
                    {r.service && <div style={{ fontWeight: 600, marginBottom: r.answers.length > 0 ? 4 : 0 }}>{r.service}</div>}
                    {r.answers.map((a) => (
                      <div key={a.question} style={{ color: 'var(--color-ink)' }}>
                        <span className="muted-text">{a.question}: </span>
                        {a.answer}
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {ACTIONS.map(({ status, label }) => (
                    <button
                      key={status}
                      onClick={() => changeStatus(r, status)}
                      disabled={r.status === status}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--color-line)',
                        background: r.status === status ? STATUS_STYLE[status].bg : 'var(--color-surface)',
                        color: r.status === status ? STATUS_STYLE[status].fg : 'var(--color-ink)',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  {r.status !== 'new' && (
                    <button
                      onClick={() => changeStatus(r, 'new')}
                      style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 12, fontWeight: 600 }}
                    >
                      대기로 되돌리기
                    </button>
                  )}
                  <input
                    defaultValue={r.memo}
                    onBlur={(e) => saveMemo(r, e.target.value.trim())}
                    placeholder="메모 (예: 부재 2회, 내일 재통화)"
                    className="input-field"
                    style={{ flex: 1, minWidth: 180, padding: '6px 10px', fontSize: 13 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
