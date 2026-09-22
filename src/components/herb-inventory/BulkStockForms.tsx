'use client';

import { useState } from 'react';

// "당귀 천궁 3 생강 대조 1" 식 입력으로 여러 약재를 한 번에 입고/사용한다. 기본은 접어둔다.
// 반영은 부모(page)가 DB 함수 한 번으로 처리하고, 성공했을 때만 입력칸을 비운다.
export default function BulkStockForms({
  onSubmit,
}: {
  onSubmit: (type: 'use' | 'restock', text: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [restockText, setRestockText] = useState('');
  const [useText, setUseText] = useState('');
  const [busy, setBusy] = useState<'restock' | 'use' | null>(null);

  async function submit(type: 'use' | 'restock') {
    const text = type === 'use' ? useText : restockText;
    if (!text.trim()) return;
    setBusy(type);
    try {
      const ok = await onSubmit(type, text);
      if (ok) {
        if (type === 'use') setUseText('');
        else setRestockText('');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card" style={{ padding: '8px 12px', marginBottom: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 14, padding: 0 }}
      >
        {open ? '▼' : '▶'} 한꺼번에 입력
        <span className="muted-text" style={{ fontWeight: 500, marginLeft: 8 }}>
          여러 약재를 글로 적어 입고·사용 반영
        </span>
      </button>
      {/* 접어도 입력 중이던 글이 사라지지 않게 숨기기만 한다. */}
      <div
        hidden={!open}
        style={{ display: open ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginTop: 10 }}
      >
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📥 일괄 입고</div>
          <p className="muted-text" style={{ marginBottom: 6 }}>
            예: 당귀 천궁 3 생강 대조 1
          </p>
          <textarea
            value={restockText}
            onChange={(e) => setRestockText(e.target.value)}
            className="input-field"
            rows={2}
            aria-label="일괄 입고 입력"
            style={{ resize: 'vertical', marginBottom: 8 }}
          />
          <button onClick={() => submit('restock')} disabled={busy !== null} className="btn-primary" style={{ width: '100%' }}>
            {busy === 'restock' ? '반영 중...' : '입고 반영'}
          </button>
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📤 일괄 사용</div>
          <p className="muted-text" style={{ marginBottom: 6 }}>
            예: 당귀 생지황 1
          </p>
          <textarea
            value={useText}
            onChange={(e) => setUseText(e.target.value)}
            className="input-field"
            rows={2}
            aria-label="일괄 사용 입력"
            style={{ resize: 'vertical', marginBottom: 8 }}
          />
          <button
            onClick={() => submit('use')}
            disabled={busy !== null}
            style={{
              width: '100%',
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid var(--color-line)',
              background: 'var(--color-surface-2)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {busy === 'use' ? '반영 중...' : '사용 반영'}
          </button>
        </div>
      </div>
    </div>
  );
}
