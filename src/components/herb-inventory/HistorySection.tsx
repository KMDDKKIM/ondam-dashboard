'use client';

import { useMemo, useState } from 'react';
import type { HerbInventoryLog } from '@/lib/types';
import { formatKstDateTime, groupLogsIntoBatches, signedChange, staffLabel } from '@/lib/herbHistory';

// 최근 재고 변경 50건을 "한꺼번에 입력" 단위로 묶어 보여준다 — 누가 언제 몇 개를 입력했는지 한눈에,
// 눌러서 펼치면 약재별 내역까지 보인다. 기본은 접어둔다.
export default function HistorySection({
  logs,
  herbNames,
  staffNames,
}: {
  logs: HerbInventoryLog[];
  herbNames: Record<string, string>;
  staffNames: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const batches = useMemo(() => groupLogsIntoBatches(logs), [logs]);

  function toggle(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <div className="card" style={{ padding: 16, marginTop: 24 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 15, padding: 0, cursor: 'pointer' }}
      >
        {open ? '▼' : '▶'} 입력 기록 (최근 {logs.length}건, {batches.length}회 입력)
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          {batches.length === 0 ? (
            <p className="muted-text">아직 기록이 없어요.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {batches.map((b, idx) => {
                const isOpen = expanded.has(idx);
                return (
                  <div key={`${b.createdAt}-${b.createdBy ?? 'x'}-${idx}`} style={{ border: '1px solid var(--color-line)', borderRadius: 10 }}>
                    <button
                      type="button"
                      onClick={() => toggle(idx)}
                      aria-expanded={isOpen}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        border: 'none',
                        background: 'transparent',
                        textAlign: 'left',
                        padding: '8px 10px',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      <span aria-hidden>{isOpen ? '▼' : '▶'}</span>
                      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatKstDateTime(b.createdAt)}</span>
                      <span style={{ fontWeight: 700 }}>{staffLabel(b.createdBy, staffNames)}</span>
                      <span className="muted-text">{b.changes.length}개 약재</span>
                      {b.note && <span className="muted-text">· {b.note}</span>}
                    </button>
                    {isOpen && (
                      <div style={{ overflowX: 'auto', borderTop: '1px solid var(--color-line)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ textAlign: 'left', color: 'var(--color-muted)' }}>
                              <th style={{ padding: '4px 8px' }}>약재</th>
                              <th style={{ padding: '4px 8px' }}>변화량</th>
                            </tr>
                          </thead>
                          <tbody>
                            {b.changes.map((l) => (
                              <tr key={l.id} style={{ borderTop: '1px solid var(--color-line)' }}>
                                <td style={{ padding: '6px 8px' }}>{herbNames[l.herbId] ?? '(삭제된 약재)'}</td>
                                <td
                                  style={{
                                    padding: '6px 8px',
                                    fontWeight: 700,
                                    color: l.changeType === 'restock' ? 'var(--color-green)' : 'var(--color-error)',
                                  }}
                                >
                                  {signedChange(l.changeType, l.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
