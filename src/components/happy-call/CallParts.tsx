'use client';

import { useState } from 'react';
import {
  CALL_KIND_LABEL,
  CALL_RESULT_LABEL,
  callOrdinal,
  MAX_ATTEMPTS,
  overdueDays,
  type CallAction,
  type WorklistItem,
} from '@/lib/happyCallQueue';
import { kstTimeOf } from '@/lib/kst';

// 해피콜 목록 페이지와 홈 위젯이 함께 쓰는 작은 화면 조각들.

const smallButton = {
  border: '1px solid var(--color-line)',
  background: 'var(--color-surface-2)',
  borderRadius: 8,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
} as const;

/** "한약 2/3" 처럼 종류 + (한약이면) 몇 번째 콜인지 */
export function kindText(item: WorklistItem): string {
  // 직접 추가하거나 비급여 구매에서 만든 콜은 고른 종류(초진/한약/린다이어트/비급여/기타)를 그대로 보여 준다.
  if (item.kind === 'manual' && item.callType) return item.callType;
  const base = CALL_KIND_LABEL[item.kind];
  return item.kind === 'herb' && item.callNumber ? `${base} ${item.callNumber}/3` : base;
}

/** 1차 / 2차 재시도 */
export function OrdinalBadge({ attempts }: { attempts: number }) {
  const n = callOrdinal(attempts);
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '1px 6px',
        borderRadius: 6,
        background: n > 1 ? 'var(--color-orange)' : 'var(--color-surface-2)',
        color: n > 1 ? '#fff' : 'var(--color-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      {n}차{n > 1 ? ' 재시도' : ''}
    </span>
  );
}

/** 예정일이 지난 콜에만 "N일 지남" */
export function OverdueBadge({ dueDate, today }: { dueDate: string; today: string }) {
  const days = overdueDays(dueDate, today);
  if (days <= 0) return null;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '1px 6px',
        borderRadius: 6,
        background: 'var(--color-error)',
        color: '#fff',
        whiteSpace: 'nowrap',
      }}
    >
      {days}일 지남
    </span>
  );
}

/**
 * 전화 걸기(tel:) 링크 + 번호 복사 버튼. 번호가 없으면 "-".
 * 이름으로 내원 이력에서 찾은 번호(source='name')는 추정이라 작게 표시하고,
 * 동명이인이라 고르지 않은 경우(ambiguous)에는 안내 문구를 붙인다.
 */
export function PhoneCell({
  phone,
  source,
  ambiguous,
}: {
  phone: string | null;
  source?: 'chart' | 'name' | null;
  ambiguous?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!phone) {
    return (
      <span className="muted-text">
        -
        {ambiguous && (
          <span title="같은 이름이 여러 명이라 번호를 자동으로 고르지 않았어요" style={{ marginLeft: 6, fontSize: 11 }}>
            ⓘ 동명이인
          </span>
        )}
      </span>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(phone!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('전화번호를 복사하세요', phone!);
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} style={{ color: 'var(--color-blue)', fontWeight: 600 }}>
        {phone}
      </a>
      <button type="button" onClick={copy} style={{ ...smallButton, padding: '2px 6px', fontSize: 11 }}>
        {copied ? '복사됨' : '복사'}
      </button>
      {source === 'name' && (
        <span className="muted-text" style={{ fontSize: 11 }}>
          내원 이력에서 찾음
        </span>
      )}
    </span>
  );
}

/** 결과 입력(통화완료/부재중/거부·연락불가 + 메모)과 "내일로 미루기". */
export function CallActions({
  item,
  busy,
  onRecord,
  onPostpone,
}: {
  item: WorklistItem;
  busy: boolean;
  onRecord: (action: CallAction, memo: string) => void;
  onPostpone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState('');
  const lastTry = item.attempts + 1 >= MAX_ATTEMPTS;

  function submit(action: CallAction) {
    onRecord(action, memo);
    setOpen(false);
    setMemo('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => setOpen((v) => !v)} style={smallButton}>
          {open ? '닫기' : '결과 입력'}
        </button>
        <button type="button" disabled={busy} onClick={onPostpone} style={smallButton}>
          내일로 미루기
        </button>
      </div>
      {open && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: 8,
            border: '1px solid var(--color-line)',
            borderRadius: 8,
            background: 'var(--color-surface)',
          }}
        >
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모 (선택)"
            aria-label="통화 메모"
            style={{ padding: 6, fontSize: 13, minWidth: 180 }}
          />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={() => submit('answered')} style={smallButton}>
              {CALL_RESULT_LABEL.answered}
            </button>
            <button type="button" disabled={busy} onClick={() => submit('no_answer')} style={smallButton}>
              {CALL_RESULT_LABEL.no_answer}
            </button>
            <button type="button" disabled={busy} onClick={() => submit('refused')} style={smallButton}>
              {CALL_RESULT_LABEL.refused}
            </button>
          </div>
          <span className="muted-text" style={{ fontSize: 11 }}>
            {lastTry
              ? '이미 한 번 부재중이었어요. 부재중을 누르면 "연락 안 됨"으로 종료돼요.'
              : '부재중을 누르면 내일 한 번 더 목록에 떠요.'}
          </span>
        </div>
      )}
    </div>
  );
}

/** "오늘 완료한 콜" 접이식 목록 — 잘못 누른 결과를 되돌리기 할 수 있다. */
export function DoneTodaySection({
  items,
  staffNames,
  busyKey,
  onUndo,
}: {
  items: WorklistItem[];
  staffNames: Record<string, string>;
  busyKey: string | null;
  onUndo: (item: WorklistItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <details style={{ marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>오늘 완료한 콜 ({items.length})</summary>
      <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
        {items.map((item) => (
          <li
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              padding: '7px 0',
              borderBottom: '1px solid var(--color-line)',
              fontSize: 13,
            }}
          >
            <span className="muted-text" style={{ fontSize: 11, fontWeight: 700, minWidth: 52 }}>
              {kindText(item)}
            </span>
            <span style={{ fontWeight: 600 }}>{item.patientName}</span>
            <span style={{ fontWeight: 700, color: item.result === 'answered' ? 'var(--color-green)' : 'var(--color-muted)' }}>
              {item.result ? CALL_RESULT_LABEL[item.result] : ''}
              {item.result === 'no_answer' ? ' · 내일 다시' : ''}
            </span>
            <span className="muted-text">
              {item.completedBy ? (staffNames[item.completedBy] ?? '-') : '-'}
              {item.completedAt ? ` · ${kstTimeOf(item.completedAt)}` : ''}
            </span>
            {item.memo && <span className="muted-text">· {item.memo}</span>}
            <button
              type="button"
              disabled={busyKey === item.key}
              onClick={() => onUndo(item)}
              style={{ ...smallButton, marginLeft: 'auto' }}
            >
              되돌리기
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
