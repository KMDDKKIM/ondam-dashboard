'use client';

import { memo, useMemo } from 'react';
import type { HerbInventoryItem } from '@/lib/types';
import { groupHerbsByInitial } from '@/lib/herbList';
import { OTHER_GROUP } from '@/lib/koreanSearch';
import HerbRow, { type HerbRowHandlers } from './HerbRow';

interface Props extends HerbRowHandlers {
  /** 정렬·필터가 끝난 목록 */
  items: HerbInventoryItem[];
  /** true면 ㄱㄴㄷ 묶음 머리글을 붙이고, 검색·필터 중(false)에는 평평한 목록으로 보여준다. */
  grouped: boolean;
  highlightId: string | null;
}

export function groupElementId(key: string): string {
  return `herb-group-${key === OTHER_GROUP ? 'etc' : key}`;
}

export function groupLabel(key: string): string {
  return key === OTHER_GROUP ? '기타' : key;
}

function HerbListInner({ items, grouped, highlightId, onAdjust, onSaveThreshold, onDelete }: Props) {
  const groups = useMemo(() => (grouped ? groupHerbsByInitial(items) : null), [grouped, items]);

  const renderRow = (item: HerbInventoryItem) => (
    <HerbRow
      key={item.id}
      item={item}
      highlighted={item.id === highlightId}
      onAdjust={onAdjust}
      onSaveThreshold={onSaveThreshold}
      onDelete={onDelete}
    />
  );

  return (
    <div
      role="table"
      aria-label="한약재 재고"
      className="card"
      // 팝업(입고·⋯)이 잘리지 않도록 overflow는 두지 않는다.
      style={{ borderRadius: 14 }}
    >
      {groups
        ? groups.map((g) => (
            <section key={g.key} aria-label={`${groupLabel(g.key)} 약재`}>
              <div
                id={groupElementId(g.key)}
                style={{
                  position: 'sticky',
                  top: 'calc(var(--herb-topbar-h, 61px) + var(--herb-toolbar-h, 56px))',
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  height: 26,
                  padding: '0 10px',
                  background: 'var(--color-surface-2)',
                  borderBottom: '1px solid var(--color-line)',
                  fontSize: 13,
                  fontWeight: 800,
                  lineHeight: '26px',
                  scrollMarginTop: 'calc(var(--herb-topbar-h, 61px) + var(--herb-toolbar-h, 56px))',
                }}
              >
                {groupLabel(g.key)}
                <span className="muted-text" style={{ fontSize: 11, fontWeight: 600 }}>
                  {g.items.length}
                </span>
              </div>
              {g.items.map(renderRow)}
            </section>
          ))
        : items.map(renderRow)}
    </div>
  );
}

const HerbList = memo(HerbListInner);
export default HerbList;
