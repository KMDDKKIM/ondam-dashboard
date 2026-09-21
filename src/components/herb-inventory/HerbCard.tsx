'use client';

import { useEffect, useState } from 'react';
import type { HerbInventoryItem } from '@/lib/types';
import { isShort, isValidThreshold } from '@/lib/herbOrder';

interface Props {
  item: HerbInventoryItem;
  // 부족 기준 저장. 실패하면 오류를 던진다.
  onSaveThreshold: (item: HerbInventoryItem, threshold: number | null) => Promise<void>;
  // 사용/입고 한 건. 실패하면 오류를 던진다(메시지는 화면에 그대로 보인다).
  onAdjust: (item: HerbInventoryItem, type: 'use' | 'restock', amount: number, note: string | null) => Promise<void>;
  onDelete: (item: HerbInventoryItem) => void;
}

const subtleButton = {
  flex: 1,
  padding: '8px 0',
  fontSize: 13,
  borderRadius: 10,
  border: '1px solid var(--color-line)',
  background: 'var(--color-surface-2)',
  fontWeight: 600,
} as const;

export default function HerbCard({ item, onSaveThreshold, onAdjust, onDelete }: Props) {
  const empty = item.currentStock <= 0;
  const short = isShort(item.currentStock, item.lowStockThreshold);

  // 부족 기준 입력 (blur / Enter 로 저장)
  const currentThresholdText = item.lowStockThreshold != null ? String(item.lowStockThreshold) : '';
  const [thresholdText, setThresholdText] = useState(currentThresholdText);
  const [thresholdError, setThresholdError] = useState('');
  const [savingThreshold, setSavingThreshold] = useState(false);
  useEffect(() => {
    setThresholdText(currentThresholdText);
  }, [currentThresholdText]);

  async function commitThreshold() {
    const trimmed = thresholdText.trim();
    if (trimmed === currentThresholdText || savingThreshold) return;
    let next: number | null = null;
    if (trimmed !== '') {
      next = Number(trimmed);
      if (!isValidThreshold(next)) {
        setThresholdError('0 이상의 정수(봉지)만 입력할 수 있어요.');
        setThresholdText(currentThresholdText);
        return;
      }
    }
    setThresholdError('');
    setSavingThreshold(true);
    try {
      await onSaveThreshold(item, next);
    } catch {
      setThresholdError('저장하지 못했습니다. 다시 시도해주세요.');
      setThresholdText(currentThresholdText);
    } finally {
      setSavingThreshold(false);
    }
  }

  // 사용/입고 인라인 입력
  const [action, setAction] = useState<'use' | 'restock' | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  function openAction(type: 'use' | 'restock') {
    setAction(type);
    setAmount('');
    setNote('');
    setActionError('');
  }

  async function submitAction() {
    if (!action) return;
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) {
      setActionError('1 이상의 정수(봉지)를 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setActionError('');
    try {
      await onAdjust(item, action, n, note.trim() || null);
      setAction(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="card"
      style={{
        padding: 18,
        borderColor: short || empty ? 'var(--color-error)' : 'var(--color-line)',
        background: empty ? '#fdecea' : short ? '#fff6e5' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</span>
        {(short || empty) && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              background: 'var(--color-error)',
              borderRadius: 999,
              padding: '2px 8px',
            }}
          >
            {empty ? '재고 없음' : '부족'}
          </span>
        )}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: empty ? 'var(--color-error)' : undefined }}>
        {item.currentStock.toLocaleString()}
        <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 4 }}>봉지</span>
      </div>

      <label className="muted-text" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        부족 기준
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={thresholdText}
          disabled={savingThreshold}
          placeholder="없음"
          aria-label={`${item.name} 부족 기준(봉지)`}
          onChange={(e) => setThresholdText(e.target.value)}
          onBlur={commitThreshold}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="input-field"
          style={{ width: 70, padding: '4px 8px', fontSize: 13 }}
        />
        봉지
        <span style={{ fontSize: 11 }}>(0 또는 빈칸 = 알림 없음)</span>
      </label>
      {thresholdError && (
        <p className="error-text" style={{ fontSize: 12, marginBottom: 4 }}>
          {thresholdError}
        </p>
      )}
      <div style={{ marginBottom: 8 }} />

      {action ? (
        <div style={{ marginTop: 4 }}>
          <input
            type="number"
            min={1}
            step={1}
            autoFocus
            placeholder={action === 'use' ? '사용 봉지 수' : '입고 봉지 수'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-field"
            style={{ marginBottom: 6 }}
          />
          <input
            placeholder="메모 (선택)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input-field"
            style={{ marginBottom: 6 }}
          />
          {actionError && (
            <p className="error-text" style={{ fontSize: 12, marginBottom: 6 }}>
              {actionError}
            </p>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={submitAction} disabled={submitting} className="btn-primary" style={{ flex: 1, padding: '8px 0', fontSize: 13 }}>
              {submitting ? '처리 중...' : '확인'}
            </button>
            <button onClick={() => setAction(null)} style={subtleButton}>
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button onClick={() => openAction('use')} style={subtleButton}>
              사용
            </button>
            <button onClick={() => openAction('restock')} className="btn-primary" style={{ flex: 1, padding: '8px 0', fontSize: 13 }}>
              입고
            </button>
          </div>
          <button
            onClick={() => onDelete(item)}
            style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 12, padding: '10px 0 0' }}
          >
            삭제
          </button>
        </>
      )}
    </div>
  );
}
