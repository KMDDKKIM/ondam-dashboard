'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { isValidThreshold } from '@/lib/herbOrder';

const popoverStyle: CSSProperties = {
  position: 'absolute',
  right: 0,
  top: '100%',
  marginTop: 4,
  zIndex: 20,
  minWidth: 220,
  padding: 12,
  borderRadius: 12,
  border: '1px solid var(--color-line)',
  background: 'var(--color-surface)',
  boxShadow: '0 8px 24px rgba(43, 42, 39, 0.18)',
};

const smallButton: CSSProperties = {
  padding: '6px 12px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid var(--color-line)',
  background: 'var(--color-surface-2)',
};

// 바깥을 누르거나 Esc를 누르면 닫는다.
function Popover({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent | TouchEvent) {
      // 여는 버튼(같은 부모 안)을 누르는 것은 바깥으로 치지 않는다 — 버튼이 여닫기를 맡는다.
      const scope = ref.current?.parentElement ?? ref.current;
      if (scope && !scope.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} role="dialog" aria-label={label} style={popoverStyle}>
      {children}
    </div>
  );
}

// "+N 입고": 한 번에 여러 봉지를 넣을 때.
export function RestockPopover({
  name,
  onSubmit,
  onClose,
}: {
  name: string;
  onSubmit: (amount: number) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function submit() {
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1) {
      setError('1 이상의 정수(봉지)를 입력해주세요.');
      return;
    }
    onSubmit(n);
    onClose();
  }

  return (
    <Popover onClose={onClose} label={`${name} 입고`}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{name} 입고</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          autoFocus
          value={text}
          placeholder="봉지 수"
          aria-label={`${name} 입고 봉지 수`}
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          className="input-field"
          style={{ padding: '6px 10px', fontSize: 14 }}
        />
        <button type="button" onClick={submit} className="btn-primary" style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}>
          입고
        </button>
      </div>
      {error && <p className="error-text" style={{ fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
    </Popover>
  );
}

// "⋯": 부족 기준 수정, 삭제. 평소엔 숨겨 둔다.
export function MorePopover({
  name,
  threshold,
  onSaveThreshold,
  onDelete,
  onClose,
}: {
  name: string;
  threshold: number | null;
  onSaveThreshold: (threshold: number | null) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const current = threshold != null ? String(threshold) : '';
  const [text, setText] = useState(current);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function commit() {
    const trimmed = text.trim();
    if (trimmed === current || saving) return;
    let next: number | null = null;
    if (trimmed !== '') {
      next = Number(trimmed);
      if (!isValidThreshold(next)) {
        setError('0 이상의 정수(봉지)만 입력할 수 있어요.');
        setText(current);
        return;
      }
    }
    setError('');
    setSaving(true);
    try {
      await onSaveThreshold(next);
    } catch {
      setError('저장하지 못했습니다. 다시 시도해주세요.');
      setText(current);
    } finally {
      setSaving(false);
    }
  }

  return (
    // 바깥을 눌러 닫을 때도 입력해 둔 기준을 저장한다(닫히면서 blur가 안 올 수 있다).
    <Popover
      onClose={() => {
        void commit();
        onClose();
      }}
      label={`${name} 설정`}
    >
      <label className="muted-text" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        부족 기준
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          autoFocus
          value={text}
          disabled={saving}
          placeholder="없음"
          aria-label={`${name} 부족 기준(봉지)`}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // Enter는 blur에만 기대지 않고 바로 저장한다(blur가 안 오는 환경에서도 저장되도록).
            if (e.key === 'Enter') {
              void commit();
              e.currentTarget.blur();
            }
          }}
          className="input-field"
          style={{ width: 72, padding: '4px 8px', fontSize: 13 }}
        />
        봉지 이하
      </label>
      <p className="muted-text" style={{ fontSize: 11, margin: '4px 0 0' }}>
        빈칸 또는 0 = 알림 없음
      </p>
      {error && <p className="error-text" style={{ fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
      <div style={{ borderTop: '1px solid var(--color-line)', marginTop: 10, paddingTop: 10 }}>
        <button
          type="button"
          onClick={() => {
            onClose();
            onDelete();
          }}
          style={{ ...smallButton, color: 'var(--color-error)', borderColor: 'var(--color-error)', width: '100%' }}
        >
          이 약재 삭제
        </button>
      </div>
    </Popover>
  );
}
