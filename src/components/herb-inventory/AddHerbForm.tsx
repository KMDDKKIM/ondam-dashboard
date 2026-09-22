'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { parseNewHerbs } from '@/lib/herbEntryParser';

// "+ 약재 추가": 한 개든 여러 줄이든 같은 입력칸. 실제 등록·중복 검사는 부모가 한다.
export default function AddHerbForm({
  onSubmit,
  onCancel,
}: {
  /** 등록을 시도한다. 입력칸을 비워도 되면 true. */
  onSubmit: (text: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => parseNewHerbs(text).entries, [text]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || text.trim() === '') return;
    setBusy(true);
    try {
      if (await onSubmit(text)) setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 14, marginBottom: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>새 약재 추가</div>
      <p className="muted-text" style={{ marginBottom: 8 }}>
        약재명 뒤에 현재 재고(정수)를 적어주세요. 하나만 적어도 되고, 줄바꿈이나 띄어쓰기로 여러 개를 구분해도 돼요.
        재고가 같은 약재는 이름을 이어 쓴 뒤 숫자를 한 번만 쓰면 돼요. 예: 당귀 5 천궁 3 생강 대조 1 (엑셀에서 복사해 붙여넣어도
        돼요). 추가하면 가나다순 자리에 바로 들어가요.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="input-field"
        rows={4}
        autoFocus
        placeholder={'당귀 5\n천궁 3\n생강 대조 1'}
        aria-label="추가할 약재"
        style={{ resize: 'vertical', marginBottom: 8 }}
      />
      {preview.length > 0 && (
        <p className="muted-text" style={{ marginBottom: 8 }}>
          추가될 약재 {preview.length}개: {preview.map((p) => `${p.name} ${p.stock}`).join(', ')}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn-primary" disabled={busy || preview.length === 0} style={{ padding: '9px 16px' }}>
          {busy ? '추가 중...' : preview.length > 1 ? `${preview.length}개 한 번에 추가` : '추가'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--color-line)', background: 'var(--color-surface-2)', fontWeight: 600 }}
        >
          닫기
        </button>
      </div>
    </form>
  );
}
