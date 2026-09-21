'use client';

import { useState } from 'react';
import { QUOTES, quoteIndexForDate } from '@/lib/dailyQuote';
import { todayKst } from '@/lib/kst';

export function QuoteBanner() {
  // 처음 문구는 한국 날짜로만 정한다(하루 동안 고정, 서버·브라우저 결과 동일).
  const [index, setIndex] = useState(() => quoteIndexForDate(todayKst()));

  function nextQuote() {
    setIndex((prev) => (prev + 1) % QUOTES.length);
  }

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '16px 20px',
        marginBottom: 20,
        borderLeft: '4px solid var(--color-brand-b)',
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--color-brand-b)',
            marginBottom: 6,
          }}
        >
          <span>💬</span>
          <span>오늘의 한마디</span>
        </div>
        <p suppressHydrationWarning style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>“{QUOTES[index]}”</p>
      </div>
      <button
        onClick={nextQuote}
        style={{
          flexShrink: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--color-muted)',
          fontSize: 13,
          fontWeight: 600,
          padding: '6px 10px',
        }}
      >
        ↻ 다른 문구
      </button>
    </div>
  );
}
