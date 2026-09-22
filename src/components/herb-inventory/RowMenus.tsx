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

// 재고 조정(입고·사용)은 더 이상 약재 행에서 하지 않는다 — "한꺼번에 입력"으로만 한다.
// (원장 결정, 2026-09-23: 개별 -1/+1/+N 버튼과 그 팝업을 없앴다.)

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

// "⋯": 이름 수정, 부족 기준(알림) 수정·끄기, 삭제. 평소엔 숨겨 둔다.
export function MorePopover({
  name,
  threshold,
  onSaveName,
  onSaveThreshold,
  onDelete,
  onClose,
}: {
  name: string;
  threshold: number | null;
  onSaveName: (name: string) => Promise<void>;
  onSaveThreshold: (threshold: number | null) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [nameText, setNameText] = useState(name);
  const [nameError, setNameError] = useState('');
  const [savingName, setSavingName] = useState(false);

  const current = threshold != null ? String(threshold) : '';
  const [text, setText] = useState(current);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function commitName() {
    const trimmed = nameText.trim();
    if (trimmed === name || savingName) return;
    if (trimmed === '') {
      setNameError('이름을 입력해주세요.');
      setNameText(name);
      return;
    }
    setNameError('');
    setSavingName(true);
    try {
      await onSaveName(trimmed);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : '저장하지 못했습니다. 다시 시도해주세요.');
      setNameText(name);
    } finally {
      setSavingName(false);
    }
  }

  async function commitThreshold(next: number | null) {
    if (next === threshold || saving) return;
    if (next != null && !isValidThreshold(next)) {
      setError('0 이상의 정수만 입력할 수 있어요.');
      setText(current);
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSaveThreshold(next);
      setText(next != null ? String(next) : '');
    } catch {
      setError('저장하지 못했습니다. 다시 시도해주세요.');
      setText(current);
    } finally {
      setSaving(false);
    }
  }

  return (
    // 바깥을 눌러 닫을 때도 입력해 둔 이름·기준을 저장한다(닫히면서 blur가 안 올 수 있다).
    <Popover
      onClose={() => {
        void commitName();
        void commitThreshold(text.trim() === '' ? null : Number(text.trim()));
        onClose();
      }}
      label={`${name} 설정`}
    >
      <label className="muted-text" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        이름
        <input
          type="text"
          autoFocus
          value={nameText}
          disabled={savingName}
          aria-label={`${name} 이름 수정`}
          onChange={(e) => setNameText(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void commitName();
              e.currentTarget.blur();
            }
          }}
          className="input-field"
          style={{ flex: 1, minWidth: 0, padding: '4px 8px', fontSize: 13 }}
        />
      </label>
      {nameError && <p className="error-text" style={{ fontSize: 12, margin: '4px 0 0' }}>{nameError}</p>}

      <div style={{ borderTop: '1px solid var(--color-line)', marginTop: 10, paddingTop: 10 }}>
        <label className="muted-text" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          부족 기준
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={text}
            disabled={saving}
            placeholder="없음"
            aria-label={`${name} 부족 기준`}
            onChange={(e) => setText(e.target.value)}
            onBlur={(e) => commitThreshold(e.target.value.trim() === '' ? null : Number(e.target.value.trim()))}
            onKeyDown={(e) => {
              // Enter는 blur에만 기대지 않고 바로 저장한다(blur가 안 오는 환경에서도 저장되도록).
              if (e.key === 'Enter') {
                void commitThreshold(text.trim() === '' ? null : Number(text.trim()));
                e.currentTarget.blur();
              }
            }}
            className="input-field"
            style={{ width: 72, padding: '4px 8px', fontSize: 13 }}
          />
          이하
        </label>
        <p className="muted-text" style={{ fontSize: 11, margin: '4px 0 0' }}>
          0 = 재고가 다 떨어지면 알림(새 약재 기본값)
        </p>
        {error && <p className="error-text" style={{ fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
        {threshold != null ? (
          <button
            type="button"
            onClick={() => void commitThreshold(null)}
            disabled={saving}
            style={{ ...smallButton, marginTop: 8, width: '100%' }}
          >
            🔕 이 약재는 알림 끄기(자주 안 쓰는 약재)
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void commitThreshold(0)}
            disabled={saving}
            style={{ ...smallButton, marginTop: 8, width: '100%' }}
          >
            🔔 알림 켜기(재고 0이면 알림)
          </button>
        )}
      </div>

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
