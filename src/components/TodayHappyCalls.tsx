'use client';

import { useHappyCallWorklist } from '@/components/happy-call/useHappyCallWorklist';
import { CallActions, DoneTodaySection, OrdinalBadge, OverdueBadge, PhoneCell, kindText } from '@/components/happy-call/CallParts';

export function TodayHappyCalls() {
  const { today, worklist, staffNames, loading, error, busyKey, reload, record, postpone, undo } = useHappyCallWorklist();

  const open = worklist?.open ?? [];
  const overdueCount = open.filter((r) => r.dueDate < today).length;

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <span>📞</span>
          <span>오늘의 해피콜</span>
          {worklist && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '1px 8px',
                borderRadius: 10,
                background: open.length > 0 ? 'var(--color-brand-b)' : 'var(--color-surface-2)',
                color: open.length > 0 ? '#fff' : 'var(--color-muted)',
              }}
            >
              {open.length}건
            </span>
          )}
        </div>
        <a href="/happy-call-list" className="muted-text" style={{ fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          전체 목록 →
        </a>
      </div>
      {error && (
        <p className="error-text">
          {error}{' '}
          <button type="button" onClick={() => reload()} style={{ fontSize: 12, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
            다시 시도
          </button>
        </p>
      )}
      {!worklist ? (
        // 읽기에 실패했으면 "대상 없음"이 아니라 위의 오류만 보인다.
        loading ? <p className="muted-text">불러오는 중...</p> : null
      ) : open.length === 0 ? (
        <p className="muted-text">오늘 해피콜 대상이 없어요.</p>
      ) : (
        <>
          {overdueCount > 0 && (
            <p style={{ color: 'var(--color-error)', fontSize: 12, marginBottom: 8 }}>지난 예정일 {overdueCount}건 포함</p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {open.map((row) => (
              <li
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '9px 0',
                  borderBottom: '1px solid var(--color-line)',
                }}
              >
                <span className="muted-text" style={{ fontSize: 11, fontWeight: 700, minWidth: 52, textAlign: 'center', paddingTop: 3 }}>
                  {kindText(row)}
                </span>
                <span style={{ flex: 1, fontSize: 14, minWidth: 120 }}>
                  {row.patientName} <OrdinalBadge attempts={row.attempts} />
                  {row.note || row.memo ? (
                    <span className="muted-text"> · {[row.note, row.memo].filter(Boolean).join(' · ')}</span>
                  ) : (
                    ''
                  )}
                  <span style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
                    <PhoneCell phone={row.phone} />
                  </span>
                </span>
                <span className="muted-text" style={{ fontSize: 12, paddingTop: 3, color: row.dueDate < today ? 'var(--color-error)' : undefined }}>
                  {row.dueDate} <OverdueBadge dueDate={row.dueDate} today={today} />
                </span>
                <CallActions
                  item={row}
                  busy={busyKey === row.key}
                  onRecord={(action, memo) => record(row, action, memo)}
                  onPostpone={() => postpone(row)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
      {worklist && <DoneTodaySection items={worklist.doneToday} staffNames={staffNames} busyKey={busyKey} onUndo={undo} />}
    </div>
  );
}
