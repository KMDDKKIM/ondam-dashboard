'use client';

import { useRef, useState } from 'react';
import { formatOrderLines, type ShortHerb } from '@/lib/herbOrder';

// 부족 기준 이하인 약재 요약(접어둠) + "발주 목록 복사". 어떤 약재가 부족한지만(이름만) 보여준다
// (권장 발주량 제안은 없앴다 — 원장 결정, 2026-09-23: 주문 수량은 직접 정한다).
// 여기서 바로 🔕 눌러 그 약재의 부족 알림을 끌 수 있다(자주 안 쓰는 약재는 목록에서 빼기).
export default function LowStockPanel({
  shorts,
  onDisableAlarm,
}: {
  shorts: ShortHerb[];
  onDisableAlarm: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  if (shorts.length === 0) return null;

  async function handleCopy() {
    const text = formatOrderLines(shorts);
    setCopied(false);
    setFallbackText(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // 클립보드 권한이 없거나 http 환경 등 — 직접 복사할 수 있게 글상자를 보여준다.
      setOpen(true);
      setFallbackText(text);
      setTimeout(() => areaRef.current?.select(), 0);
    }
  }

  const preview = shorts.slice(0, 4).map((s) => s.name).join(', ') + (shorts.length > 4 ? ' …' : '');

  return (
    <div className="card" style={{ padding: '8px 12px', marginBottom: 10, borderColor: 'var(--color-gold)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{ border: 'none', background: 'transparent', fontWeight: 700, fontSize: 14, padding: 0, textAlign: 'left', flex: 1, minWidth: 0 }}
        >
          {open ? '▼' : '▶'} ⚠️ 부족한 약재 {shorts.length}개
          {!open && (
            <span className="muted-text" style={{ fontWeight: 500, marginLeft: 8 }}>
              {preview}
            </span>
          )}
        </button>
        <button className="btn-primary" onClick={handleCopy} style={{ padding: '6px 12px', fontSize: 13 }}>
          {copied ? '복사됨 ✓' : '발주 목록 복사'}
        </button>
      </div>
      {open && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {shorts.map((s) => (
              <span
                key={s.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 6px 4px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--color-line)',
                  background: 'var(--color-surface)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {s.name}
                <button
                  type="button"
                  onClick={() => onDisableAlarm(s.id)}
                  title={`${s.name} 부족 알림 끄기(자주 안 쓰는 약재)`}
                  aria-label={`${s.name} 부족 알림 끄기`}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    lineHeight: 1,
                    padding: '2px 4px',
                    borderRadius: 999,
                    color: 'var(--color-muted)',
                  }}
                >
                  🔕
                </button>
              </span>
            ))}
          </div>
          {fallbackText != null && (
            <div style={{ marginTop: 8 }}>
              <p className="muted-text" style={{ marginBottom: 6 }}>
                자동 복사가 안 돼요. 아래 글을 선택해서 직접 복사해주세요.
              </p>
              <textarea
                ref={areaRef}
                readOnly
                value={fallbackText}
                rows={Math.min(8, shorts.length + 1)}
                className="input-field"
                style={{ width: '100%', resize: 'vertical' }}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
