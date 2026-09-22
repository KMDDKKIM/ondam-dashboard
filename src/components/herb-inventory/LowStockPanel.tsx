'use client';

import { useEffect, useRef, useState } from 'react';
import { formatOrderLines, type ShortHerb } from '@/lib/herbOrder';
import type { HerbOrderMemo } from '@/lib/types';

// "발주 요청 목록"(직접 적어두는 메모, 맨 위) + 부족 기준 이하인 약재 요약(자동 감지, 그 아래,
// 접어둠) + "발주 목록 복사". 어떤 약재가 부족한지만(이름만) 보여준다(권장 발주량 제안은
// 없앴다 — 원장 결정, 2026-09-23). 부족한 약재 칸에서 바로 🔕 눌러 그 약재의 부족 알림을
// 끌 수 있다(자주 안 쓰는 약재는 목록에서 빼기).
export default function LowStockPanel({
  shorts,
  onDisableAlarm,
  memo,
  onSaveMemo,
}: {
  shorts: ShortHerb[];
  onDisableAlarm: (id: string) => void;
  memo: HerbOrderMemo;
  onSaveMemo: (text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const hasShorts = shorts.length > 0;

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
      <OrderMemo memo={memo} onSave={onSaveMemo} />

      {hasShorts && (
        <div style={{ borderTop: '1px solid var(--color-line)', marginTop: 10, paddingTop: 10 }}>
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
      )}
    </div>
  );
}

// 발주 요청 목록: 다음 주문 때 같이 시킬 약재를 직접 적어두는 메모 한 장. 지금 당장 자동으로
// 부족 표시가 안 뜨는 약재도 여기 적어두면 된다 — 저장하면 새로고침해도, 다른 직원 화면에도
// 그대로 남는다. 자주 볼 건 아니라 칸을 작게 뒀다.
function OrderMemo({ memo, onSave }: { memo: HerbOrderMemo; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(memo.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 처음 불러오거나(초기값 '') 다른 직원이 저장한 최신 내용이 오면 칸에 반영한다.
  useEffect(() => {
    setText(memo.text);
  }, [memo.updatedAt]);

  async function commit() {
    if (text === memo.text || saving) return;
    setError('');
    setSaving(true);
    try {
      await onSave(text);
    } catch {
      setError('저장하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>📝 발주 요청 목록</div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        rows={2}
        placeholder="예: 당귀 다음 주문 때 같이 시키기"
        aria-label="발주 요청 목록"
        disabled={saving}
        className="input-field"
        style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
      />
      {error ? (
        <p className="error-text" style={{ fontSize: 11, margin: '4px 0 0' }}>{error}</p>
      ) : (
        <p className="muted-text" style={{ fontSize: 11, margin: '4px 0 0' }}>
          {saving ? '저장 중...' : '적어두면 새로고침해도, 다른 직원 화면에도 그대로 남아요.'}
        </p>
      )}
    </div>
  );
}
