'use client';

import { memo, useState } from 'react';
import type { HerbInventoryItem } from '@/lib/types';
import { bagCount, isEmptyHerb, isShortHerb } from '@/lib/herbList';
import { MorePopover } from './RowMenus';

export interface HerbRowHandlers {
  onSaveThreshold: (id: string, threshold: number | null) => Promise<void>;
  onDelete: (id: string) => void;
}

interface Props extends HerbRowHandlers {
  item: HerbInventoryItem;
  highlighted: boolean;
}

// 카드 한 칸짜리 약재 행. 재고 조정(입고·사용)은 위의 "한꺼번에 입력"에서만 하므로,
// 여기서는 이름·봉지 수·⋯(부족 기준·삭제)만 보여준다 — 여러 칸을 나란히 배치해도 좁다.
function HerbRowInner({ item, highlighted, onSaveThreshold, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const bags = bagCount(item.currentStock);
  const empty = isEmptyHerb(item);
  const short = isShortHerb(item);
  const bagColor = empty ? 'var(--color-error)' : short ? '#b7791f' : 'var(--color-ink)';
  const threshold = item.lowStockThreshold;

  return (
    <div
      id={`herb-row-${item.id}`}
      role="row"
      data-herb-name={item.name}
      style={{
        position: 'relative',
        zIndex: menuOpen ? 6 : undefined,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 40,
        padding: '5px 8px',
        margin: 4,
        borderRadius: 10,
        border: '1px solid var(--color-line)',
        scrollMarginTop: 'calc(var(--herb-topbar-h, 61px) + var(--herb-toolbar-h, 56px) + 34px)',
        background: highlighted ? '#d8eefb' : empty ? '#fdecea' : short ? '#fff6e5' : 'var(--color-surface)',
        transition: 'background 0.4s ease',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.name}
      </span>

      <span
        aria-label={`${item.name} 현재 ${bags}봉지`}
        style={{ minWidth: 52, textAlign: 'right', fontSize: 18, fontWeight: 800, color: bagColor, fontVariantNumeric: 'tabular-nums' }}
      >
        {bags.toLocaleString()}
        <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2, color: 'var(--color-muted)' }}>봉지</span>
      </span>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`${item.name} 더 보기(부족 기준·삭제)`}
          aria-expanded={menuOpen}
          title="부족 기준 · 삭제"
          style={{
            height: 28,
            minWidth: 26,
            padding: 0,
            background: 'transparent',
            border: 'none',
            color: 'var(--color-muted)',
            fontSize: 18,
            borderRadius: 8,
          }}
        >
          ⋯
        </button>
        {menuOpen && (
          <MorePopover
            name={item.name}
            threshold={threshold}
            onSaveThreshold={(t) => onSaveThreshold(item.id, t)}
            onDelete={() => onDelete(item.id)}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// 다른 약재의 재고가 바뀌어도 이 행은 다시 그리지 않는다(약 200행).
const HerbRow = memo(HerbRowInner, (a, b) => a.item === b.item && a.highlighted === b.highlighted);
export default HerbRow;
