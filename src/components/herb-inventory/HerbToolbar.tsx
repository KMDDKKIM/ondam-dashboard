'use client';

import { useEffect, useRef, type RefObject } from 'react';
import type { HerbCounts, HerbFilter } from '@/lib/herbList';

interface Props {
  query: string;
  onQuery: (q: string) => void;
  filter: HerbFilter;
  onFilter: (f: HerbFilter) => void;
  counts: HerbCounts;
  shownCount: number;
  inputRef: RefObject<HTMLInputElement | null>;
  /** 검색창에서 Enter */
  onEnter: () => void;
}

const CHIPS: { id: HerbFilter; label: string; key: keyof HerbCounts; title: string }[] = [
  { id: 'all', label: '전체', key: 'all', title: '모든 약재' },
  { id: 'short', label: '부족', key: 'short', title: '부족 기준 이하(0봉지 포함)' },
  { id: 'empty', label: '0봉지', key: 'empty', title: '재고가 다 떨어진 약재' },
];

// 화면 위쪽에 붙어 있는 검색·필터 줄. 높이를 CSS 변수로 알려줘서 묶음 머리글이 그 아래에 붙는다.
export default function HerbToolbar({ query, onQuery, filter, onFilter, counts, shownCount, inputRef, onEnter }: Props) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const host = bar?.parentElement;
    if (!bar || !host) return;
    const topbar = document.querySelector('header');
    const update = () => {
      host.style.setProperty('--herb-toolbar-h', `${bar.offsetHeight}px`);
      host.style.setProperty('--herb-topbar-h', `${topbar ? topbar.getBoundingClientRect().height : 61}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bar);
    if (topbar) ro.observe(topbar);
    return () => ro.disconnect();
  }, []);

  const filtering = query.trim() !== '' || filter !== 'all';

  return (
    <div
      ref={barRef}
      className="no-print"
      style={{
        position: 'sticky',
        top: 'var(--herb-topbar-h, 61px)',
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        padding: '8px 4px',
        marginBottom: 8,
        background: 'var(--color-bg)',
      }}
    >
      <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
        <input
          ref={inputRef}
          type="search"
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (query !== '') {
                e.preventDefault();
                onQuery('');
              }
            } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder="약재 검색 (예: 당귀, ㄷㄱ)"
          aria-label="약재 검색"
          autoComplete="off"
          className="input-field"
          style={{ padding: '9px 34px 9px 12px', fontSize: 15 }}
        />
        {query !== '' && (
          <button
            type="button"
            onClick={() => {
              onQuery('');
              inputRef.current?.focus();
            }}
            aria-label="검색어 지우기"
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-muted)',
              fontSize: 16,
              padding: '2px 6px',
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div role="group" aria-label="보기 필터" style={{ display: 'flex', gap: 6 }}>
        {CHIPS.map((c) => {
          const active = filter === c.id;
          const danger = c.id !== 'all' && counts[c.key] > 0;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={active}
              title={c.title}
              onClick={() => onFilter(c.id)}
              style={{
                padding: '7px 12px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 700,
                border: `1px solid ${active ? 'var(--color-brand-b)' : 'var(--color-line)'}`,
                background: active ? 'var(--color-brand-b)' : 'var(--color-surface)',
                color: active ? '#fff' : danger ? 'var(--color-error)' : 'var(--color-ink)',
                whiteSpace: 'nowrap',
              }}
            >
              {c.label} {counts[c.key]}
            </button>
          );
        })}
      </div>

      <span className="muted-text" style={{ fontWeight: 700, whiteSpace: 'nowrap' }} aria-live="polite">
        {filtering ? `${counts.all}종 중 ${shownCount}종` : `총 ${counts.all}종`}
      </span>
    </div>
  );
}
