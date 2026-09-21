'use client';

import { useEffect, useRef, useState } from 'react';
import { CONFIRM_EVENT, setConfirmHostMounted, type ConfirmRequest } from '@/lib/confirmDialog';

// confirmDialog() 가 부르는 확인 창을 화면에 그린다. (app) 레이아웃에 한 번만 둔다.
export function ConfirmHost() {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  const yesRef = useRef<HTMLButtonElement>(null);
  const current = queue[0] ?? null;

  useEffect(() => {
    setConfirmHostMounted(true);
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<ConfirmRequest>).detail;
      setQueue((q) => [...q, detail]);
    };
    window.addEventListener(CONFIRM_EVENT, onRequest);
    return () => {
      window.removeEventListener(CONFIRM_EVENT, onRequest);
      setConfirmHostMounted(false);
    };
  }, []);

  useEffect(() => {
    if (current) yesRef.current?.focus();
  }, [current]);

  function answer(ok: boolean) {
    if (!current) return;
    current.resolve(ok);
    setQueue((q) => q.slice(1));
  }

  if (!current) return null;

  return (
    <div
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') answer(false);
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(43, 42, 39, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="확인"
        className="card"
        style={{ maxWidth: 460, width: '100%', padding: 22, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
      >
        <p style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{current.message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={() => answer(false)}
            style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, borderRadius: 10, border: '1px solid var(--color-line)', background: 'var(--color-surface-2)' }}
          >
            취소
          </button>
          <button ref={yesRef} type="button" onClick={() => answer(true)} className="btn-primary" style={{ padding: '10px 22px', fontSize: 14 }}>
            {current.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
