'use client';

import { useState } from 'react';

// "당귀 천궁 3 생강 대조 1" 식 입력으로 여러 약재를 한 번에 입고/사용한다.
// 반영은 부모(page)가 DB 함수 한 번으로 처리하고, 성공했을 때만 입력칸을 비운다.
export default function BulkStockForms({
  onSubmit,
}: {
  onSubmit: (type: 'use' | 'restock', text: string) => Promise<boolean>;
}) {
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>📥 일괄 입고 (봉지)</div>
        <p className="muted-text" style={{ marginBottom: 8 }}>
          예: 당귀 천궁 3 생강 대조 1
        </p>
        <textarea
          value={restockText}
          onChange={(e) => setRestockText(e.target.value)}
          className="input-field"
          rows={2}
          style={{ resize: 'vertical', marginBottom: 8 }}
        />
        <button onClick={() => submit('restock')} disabled={busy !== null} className="btn-primary" style={{ width: '100%' }}>
          {busy === 'restock' ? '반영 중...' : '입고 반영'}
        </button>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>📤 일괄 사용 (봉지)</div>
        <p className="muted-text" style={{ marginBottom: 8 }}>
          예: 당귀 생지황 1
        </p>
        <textarea
          value={useText}
          onChange={(e) => setUseText(e.target.value)}
          className="input-field"
          rows={2}
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
  );
}
