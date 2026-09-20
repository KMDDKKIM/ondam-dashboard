'use client';

import { useRef, useState } from 'react';
import { formatOrderLines, type ShortHerb } from '@/lib/herbOrder';

// 부족 기준 이하인 약재 목록 + "발주 목록 복사". 권장 발주량은 제안일 뿐이다.
export default function LowStockPanel({ shorts }: { shorts: ShortHerb[] }) {
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
      setFallbackText(text);
      setTimeout(() => areaRef.current?.select(), 0);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20, borderColor: 'var(--color-gold)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700 }}>⚠️ 부족한 약재 ({shorts.length}개)</div>
        <button className="btn-primary" onClick={handleCopy} style={{ padding: '8px 14px', fontSize: 13 }}>
          {copied ? '복사됨 ✓' : '발주 목록 복사'}
        </button>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {shorts.map((s) => (
          <li key={s.name} style={{ fontSize: 14 }}>
            <strong>{s.name}</strong> — 현재 {s.currentStock}봉지 (기준 {s.threshold}) — 권장 발주 {s.recommend}봉지
          </li>
        ))}
      </ul>
      <p className="muted-text" style={{ marginTop: 10 }}>
        권장 발주량은 제안이에요: 부족 기준의 2배까지 채우도록 (기준×2 − 현재), 최소 1봉지. 실제 주문 수량은 직접 정해주세요.
      </p>
      {fallbackText != null && (
        <div style={{ marginTop: 10 }}>
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
    </div>
  );
}
