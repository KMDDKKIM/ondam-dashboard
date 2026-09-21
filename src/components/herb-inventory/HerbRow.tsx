'use client';

import { memo, useState, type CSSProperties } from 'react';
import type { HerbInventoryItem } from '@/lib/types';
import { bagCount, isEmptyHerb, isShortHerb } from '@/lib/herbList';
import { MorePopover, RestockPopover } from './RowMenus';

export interface HerbRowHandlers {
  onAdjust: (id: string, type: 'use' | 'restock', amount: number) => void;
  onSaveThreshold: (id: string, threshold: number | null) => Promise<void>;
  onDelete: (id: string) => void;
}

interface Props extends HerbRowHandlers {
  item: HerbInventoryItem;
  highlighted: boolean;
}

const btnBase: CSSProperties = {
  height: 32,
  minWidth: 40,
  padding: '0 10px',
  fontSize: 14,
  fontWeight: 700,
  borderRadius: 8,
  border: '1px solid var(--color-line)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-ink)',
  lineHeight: 1,
};

// 한 줄(약 40px)짜리 약재 행. 기본 화면에는 이름·봉지 수·−1/+1·입고·⋯ 만 보인다.
function HerbRowInner({ item, highlighted, onAdjust, onSaveThreshold, onDelete }: Props) {
  const [menu, setMenu] = useState<'restock' | 'more' | null>(null);
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
        zIndex: menu ? 6 : undefined,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 40,
        padding: '3px 10px',
        borderBottom: '1px solid var(--color-line)',
        scrollMarginTop: 'calc(var(--herb-topbar-h, 61px) + var(--herb-toolbar-h, 56px) + 34px)',
        background: highlighted ? '#d8eefb' : empty ? '#fdecea' : short ? '#fff6e5' : 'var(--color-surface)',
        transition: 'background 0.4s ease',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.name}
      </span>

      {threshold != null && threshold > 0 && (
        <button
          type="button"
          onClick={() => setMenu('more')}
          title="부족 기준 수정"
          aria-label={`${item.name} 부족 기준 ${threshold}봉지, 누르면 수정`}
          style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 12, padding: '0 4px' }}
        >
          기준 {threshold}
        </button>
      )}

      <span
        aria-label={`${item.name} 현재 ${bags}봉지`}
        style={{ minWidth: 72, textAlign: 'right', fontSize: 22, fontWeight: 800, color: bagColor, fontVariantNumeric: 'tabular-nums' }}
      >
        {bags.toLocaleString()}
        <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 2, color: 'var(--color-muted)' }}>봉지</span>
      </span>

      <button
        type="button"
        data-herb-minus={item.id}
        disabled={bags <= 0}
        onClick={() => onAdjust(item.id, 'use', 1)}
        aria-label={`${item.name} 한 봉지 뜯음(−1)`}
        title="한 봉지 뜯음"
        style={{
          ...btnBase,
          minWidth: 52,
          background: bags <= 0 ? 'var(--color-surface-2)' : '#fff',
          borderColor: bags <= 0 ? 'var(--color-line)' : 'var(--color-error)',
          color: bags <= 0 ? 'var(--color-muted)' : 'var(--color-error)',
          opacity: bags <= 0 ? 0.5 : 1,
          cursor: bags <= 0 ? 'not-allowed' : 'pointer',
        }}
      >
        −1
      </button>
      <button
        type="button"
        data-herb-plus={item.id}
        onClick={() => onAdjust(item.id, 'restock', 1)}
        aria-label={`${item.name} 한 봉지 입고(+1)`}
        style={btnBase}
      >
        +1
      </button>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setMenu(menu === 'restock' ? null : 'restock')}
          aria-label={`${item.name} 여러 봉지 입고`}
          aria-expanded={menu === 'restock'}
          title="여러 봉지 입고"
          style={{ ...btnBase, fontSize: 13, fontWeight: 600 }}
        >
          +N
        </button>
        {menu === 'restock' && (
          <RestockPopover
            name={item.name}
            onSubmit={(n) => onAdjust(item.id, 'restock', n)}
            onClose={() => setMenu(null)}
          />
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setMenu(menu === 'more' ? null : 'more')}
          aria-label={`${item.name} 더 보기(부족 기준·삭제)`}
          aria-expanded={menu === 'more'}
          title="부족 기준 · 삭제"
          style={{ ...btnBase, minWidth: 32, padding: 0, background: 'transparent', border: 'none', color: 'var(--color-muted)', fontSize: 18 }}
        >
          ⋯
        </button>
        {menu === 'more' && (
          <MorePopover
            name={item.name}
            threshold={threshold}
            onSaveThreshold={(t) => onSaveThreshold(item.id, t)}
            onDelete={() => onDelete(item.id)}
            onClose={() => setMenu(null)}
          />
        )}
      </div>
    </div>
  );
}

// 다른 약재의 재고가 바뀌어도 이 행은 다시 그리지 않는다(약 200행).
const HerbRow = memo(HerbRowInner, (a, b) => a.item === b.item && a.highlighted === b.highlighted);
export default HerbRow;
