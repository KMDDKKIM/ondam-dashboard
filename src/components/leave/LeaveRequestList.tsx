'use client';

import { useState } from 'react';
import type { LeaveKind } from '@/lib/leave';
import type { LeaveRequest, LeaveRequestEdit } from '@/lib/supabase/leave';

const kindLabel: Record<LeaveKind, string> = { monthly: '월차', annual: '연차' };

function rangeLabel(r: LeaveRequest): string {
  const range = r.endDate !== r.startDate ? `${r.startDate} ~ ${r.endDate}` : r.startDate;
  return `${range}${r.halfDay ? (r.halfDay === 'am' ? ' 오전반차' : ' 오후반차') : ''}`;
}

interface LeaveRequestListProps {
  requests: LeaveRequest[];
  /** 원장이 여러 직원 것을 볼 때 이름을 앞에 붙인다. */
  showStaffName?: boolean;
  emptyText: string;
  /** 변경을 저장한다. 성공하면 true(폼을 닫는다), 실패하면 false(폼을 열어 둔다). */
  onSave: (request: LeaveRequest, edit: LeaveRequestEdit) => Promise<boolean>;
  onCancel: (request: LeaveRequest) => void;
  /** 변경하면 다시 승인을 받아야 하는 사람(직원 본인)에게 안내 문구를 보여 준다. */
  editNeedsReapproval: boolean;
  /** 변경할 때 고를 수 있는 구분 — 생략하면 월차·연차 모두. 지금 신청의 구분은 항상 포함한다. */
  allowedKinds?: LeaveKind[];
}

// 연차 신청 목록 한 줄 한 줄에 "변경"(그 자리에서 날짜·반차·구분·사유를 고침)과 "취소"를 붙인다.
// 확정된 건도 똑같이 변경·취소할 수 있다(원장 요청, 2026-10-02).
export function LeaveRequestList({ requests, showStaffName = false, emptyText, onSave, onCancel, editNeedsReapproval, allowedKinds }: LeaveRequestListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LeaveRequestEdit | null>(null);
  const [saving, setSaving] = useState(false);

  function startEdit(r: LeaveRequest) {
    setEditingId(r.id);
    setDraft({ startDate: r.startDate, endDate: r.endDate, halfDay: r.halfDay, kind: r.kind, memo: r.memo });
  }

  function patch(p: Partial<LeaveRequestEdit>) {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...p };
      // 반차는 하루짜리일 때만 — 기간이 하루가 아니게 되면 종일로 되돌린다.
      if (next.startDate !== next.endDate) next.halfDay = null;
      return next;
    });
  }

  async function save(r: LeaveRequest) {
    if (!draft || draft.startDate > draft.endDate) return;
    setSaving(true);
    try {
      if (await onSave(r, draft)) {
        setEditingId(null);
        setDraft(null);
      }
    } finally {
      setSaving(false);
    }
  }

  if (requests.length === 0) return <p className="muted-text">{emptyText}</p>;

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {requests.map((r) => {
        const editing = editingId === r.id && draft !== null;
        return (
          <li key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {showStaffName && <span style={{ fontWeight: 600 }}>{r.staffName}</span>}
              <span style={{ fontWeight: showStaffName ? 400 : 600, fontSize: 13 }}>{rangeLabel(r)}</span>
              <span className="muted-text" style={{ fontSize: 13 }}>{kindLabel[r.kind]}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1px 8px',
                  borderRadius: 999,
                  color: r.status === 'approved' ? 'var(--color-green)' : 'var(--color-muted)',
                  background: r.status === 'approved' ? 'rgba(79, 174, 106, 0.14)' : 'var(--color-surface-2)',
                }}
              >
                {r.status === 'approved' ? '확정' : '승인 대기'}
              </span>
              {r.memo && <span className="muted-text" style={{ fontSize: 13 }}>{r.memo}</span>}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => (editing ? setEditingId(null) : startEdit(r))}
                  style={{ border: 'none', background: 'transparent', color: 'var(--color-brand-b)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  {editing ? '닫기' : '변경'}
                </button>
                <button
                  type="button"
                  onClick={() => onCancel(r)}
                  style={{ border: 'none', background: 'transparent', color: 'var(--color-error)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  취소
                </button>
              </div>
            </div>

            {editing && draft && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'var(--color-surface-2)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                <div>
                  <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>시작일</label>
                  <input className="input-field" type="date" value={draft.startDate} onChange={(e) => patch({ startDate: e.target.value })} style={{ padding: '5px 8px' }} />
                </div>
                <div>
                  <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>종료일</label>
                  <input className="input-field" type="date" value={draft.endDate} onChange={(e) => patch({ endDate: e.target.value })} style={{ padding: '5px 8px' }} />
                </div>
                <div>
                  <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>구분</label>
                  <select className="input-field" value={draft.kind} onChange={(e) => patch({ kind: e.target.value as LeaveKind })} style={{ width: 90, padding: '5px 8px' }}>
                    {(['monthly', 'annual'] as LeaveKind[])
                      .filter((k) => !allowedKinds || allowedKinds.includes(k) || k === draft.kind)
                      .map((k) => (
                        <option key={k} value={k}>
                          {kindLabel[k]}
                        </option>
                      ))}
                  </select>
                </div>
                {draft.startDate === draft.endDate && (
                  <div>
                    <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>반차</label>
                    <select
                      className="input-field"
                      value={draft.halfDay ?? ''}
                      onChange={(e) => patch({ halfDay: e.target.value ? (e.target.value as 'am' | 'pm') : null })}
                      style={{ width: 110, padding: '5px 8px' }}
                    >
                      <option value="">종일</option>
                      <option value="am">오전 반차</option>
                      <option value="pm">오후 반차</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>사유</label>
                  <input className="input-field" value={draft.memo} onChange={(e) => patch({ memo: e.target.value })} style={{ width: 150, padding: '5px 8px' }} />
                </div>
                <button type="button" className="btn-primary" disabled={saving || draft.startDate > draft.endDate} onClick={() => save(r)} style={{ padding: '6px 16px', fontSize: 13 }}>
                  {saving ? '저장 중...' : '변경 저장'}
                </button>
                {editNeedsReapproval && r.status === 'approved' && (
                  <p className="muted-text" style={{ width: '100%', fontSize: 12, margin: 0 }}>
                    변경하면 확정이 풀리고 원장님 승인을 다시 받아야 해요.
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
