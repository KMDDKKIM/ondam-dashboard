'use client';

import { useState } from 'react';
import { formatShortDate } from '@/lib/dateDisplay';

interface Props {
  value: string | null;
  onCommit: (value: string) => void;
  todayYear: number;
}

// 표 안의 날짜 칸. 평소에는 "9/14"처럼 짧게 보이고, 비어 있으면 아무것도 안 보이는 빈칸으로 둔다
// (브라우저 기본 날짜 입력은 빈칸에도 "연도-월-일"이 써 있어 지저분했다). 칸을 누르면 날짜 선택이 열리고,
// 값을 지우면 다시 빈칸이 된다.
export function DateCell({ value, onCommit, todayYear }: Props) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div
        className="date-cell"
        role="button"
        tabIndex={0}
        title={value ? `${value} — 눌러서 고치기` : '눌러서 날짜 입력'}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {formatShortDate(value, todayYear)}
      </div>
    );
  }

  return (
    <input
      type="date"
      autoFocus
      defaultValue={value ?? ''}
      onFocus={(e) => {
        try {
          e.currentTarget.showPicker?.();
        } catch {
          // 선택창을 못 열어도 직접 입력할 수 있다.
        }
      }}
      onBlur={(e) => {
        setEditing(false);
        if (e.target.value !== (value ?? '')) onCommit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.currentTarget.value = value ?? '';
          e.currentTarget.blur();
        }
      }}
      style={{ fontSize: 12, padding: 1, width: '100%', border: '1px solid var(--color-brand-b)', borderRadius: 4 }}
    />
  );
}
