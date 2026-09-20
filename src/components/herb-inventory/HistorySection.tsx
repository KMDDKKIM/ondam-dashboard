'use client';

import { useState } from 'react';
import type { HerbInventoryLog } from '@/lib/types';
import { formatKstDateTime, signedChange, staffLabel } from '@/lib/herbHistory';

// 최근 재고 변경 50건. 기본은 접어둔다.
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
  return (
    <div className="card" style={{ padding: 16, marginTop: 24 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 15, padding: 0, cursor: 'pointer' }}
      >
        {open ? '▼' : '▶'} 변경 이력 (최근 {logs.length}건)
      </button>
      {open && (
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          {logs.length === 0 ? (
            <p className="muted-text">아직 기록이 없어요.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--color-muted)' }}>
                  <th style={{ padding: '4px 8px' }}>시각(KST)</th>
                  <th style={{ padding: '4px 8px' }}>약재</th>
                  <th style={{ padding: '4px 8px' }}>변화량</th>
                  <th style={{ padding: '4px 8px' }}>처리자</th>
                  <th style={{ padding: '4px 8px' }}>메모</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--color-line)' }}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{formatKstDateTime(l.createdAt)}</td>
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
                    <td style={{ padding: '6px 8px' }}>{staffLabel(l.createdBy, staffNames)}</td>
                    <td style={{ padding: '6px 8px' }} className="muted-text">
                      {l.note ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
