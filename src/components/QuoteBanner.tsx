'use client';

import { useState } from 'react';

const QUOTES = [
  '오늘도 환자분의 이야기를 먼저 들어주세요.',
  '작은 친절이 재진율을 만듭니다.',
  '기록이 쌓이면 진료의 방향이 보입니다.',
  '바쁠수록 해피콜 한 통이 더 중요합니다.',
  '오늘 걸어야 할 전화, 미루지 않기.',
  '환자의 다음 방문을 미리 준비하세요.',
];

export function QuoteBanner() {
  const [index, setIndex] = useState(0);

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
        <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>“{QUOTES[index]}”</p>
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
