'use client';

import { useState } from 'react';
import { DURATION_PRESETS } from '@/lib/supabase/nonCoveredPurchases';
import { computeHerbCallDates } from '@/lib/happyCallStats';
import type { EditableNonCoveredPurchase } from '@/lib/supabase/nonCoveredPurchases';
import type { GoalCategory, NonCoveredProduct, NonCoveredPurchase } from '@/lib/types';
import { Field, fieldGrid, inputBig } from './Field';
import { GOAL_CATEGORY_LABEL, formatAmount, monthDay, shortDate } from './shared';

interface Props {
  rows: NonCoveredPurchase[];
  products: NonCoveredProduct[];
  /** 직원 id -> 이름 (승인된 직원). 없으면 삭제된 직원으로 본다. */
  staffNames: Record<string, string>;
  /** 저장이 끝나 편집 상태를 닫아도 되면 true */
  onSave: (existing: NonCoveredPurchase, patch: EditableNonCoveredPurchase) => Promise<boolean>;
  onDelete: (purchase: NonCoveredPurchase) => void;
}

interface Draft {
  patientName: string;
  chartNo: string;
  phone: string;
  category: string;
  productName: string;
  amount: string;
  purchaseDate: string;
  happyCallDate: string;
  durationDays: string;
  goalCategory: GoalCategory | null;
  memo: string;
}

const HEADERS = ['구매일', '환자', '차트', '구분', '상품', '금액', '해피콜', '목표', '메모', '등록자', ''];

// 한 줄로 깔끔하게: 모든 칸을 줄바꿈 없이 한 줄에 보여 주고, 화면이 좁으면 표를 옆으로 밀어 본다.
const cell = { padding: '12px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' } as const;
const nowrap = { whiteSpace: 'nowrap' } as const;

function toDraft(p: NonCoveredPurchase): Draft {
  return {
    patientName: p.patientName,
    chartNo: p.chartNo,
    phone: p.phone ?? '',
    category: p.category,
    productName: p.productName,
    amount: p.amount != null ? String(p.amount) : '',
    purchaseDate: p.purchaseDate,
    happyCallDate: p.happyCallDate ?? '',
    durationDays: p.durationDays != null ? String(p.durationDays) : '',
    goalCategory: p.goalCategory,
    memo: p.memo ?? '',
  };
}

function toPatch(d: Draft): EditableNonCoveredPurchase {
  return {
    patientName: d.patientName.trim(),
    chartNo: d.chartNo.trim(),
    phone: d.phone.trim() || null,
    category: d.category.trim() || '일반',
    productName: d.productName.trim(),
    amount: d.amount ? Number(d.amount) : null,
    purchaseDate: d.purchaseDate,
    memo: d.memo.trim() || null,
    goalCategory: d.goalCategory,
    happyCallDate: d.happyCallDate || null,
    durationDays: d.durationDays ? Number(d.durationDays) : null,
  };
}

export function MissingAmountChip() {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        border: '1px solid var(--color-line)',
        background: 'var(--color-surface-2)',
        color: 'var(--color-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      금액 미입력
    </span>
  );
}

function creatorLabel(createdBy: string | null, staffNames: Record<string, string>): string {
  return createdBy && staffNames[createdBy] ? staffNames[createdBy] : '(삭제된 직원)';
}

export function PurchaseTable({ rows, products, staffNames, onSave, onDelete }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveEdit(existing: NonCoveredPurchase) {
    if (!draft || saving) return;
    if (!draft.patientName.trim() || !draft.chartNo.trim() || !draft.productName.trim()) return;
    setSaving(true);
    try {
      if (await onSave(existing, toPatch(draft))) cancelEdit();
    } finally {
      setSaving(false);
    }
  }

  function field<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  // 수정: 한 줄 안에서 칸별로 고치지 않고, 이름표가 붙은 입력칸을 모두 펼친 카드로 보여 준다.
  function editRow(p: NonCoveredPurchase, d: Draft) {
    const invalid = !d.patientName.trim() || !d.chartNo.trim() || !d.productName.trim();
    return (
      <tr key={p.id} style={{ borderTop: '1px solid var(--color-line)', background: 'var(--color-surface-2)' }}>
        <td colSpan={HEADERS.length} style={{ padding: 18 }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>
            ✏️ {p.patientName}님 구매 기록 수정
          </div>
          <div style={fieldGrid}>
            <Field label="환자 성함 *">
              <input value={d.patientName} onChange={(e) => field('patientName', e.target.value)} className="input-field" style={inputBig} />
            </Field>
            <Field label="차트번호 *">
              <input value={d.chartNo} onChange={(e) => field('chartNo', e.target.value)} className="input-field" style={inputBig} />
            </Field>
            <Field label="구분">
              <input value={d.category} onChange={(e) => field('category', e.target.value)} className="input-field" style={inputBig} />
            </Field>
            <Field label="상품 *">
              <input value={d.productName} onChange={(e) => field('productName', e.target.value)} className="input-field" style={inputBig} list="non-covered-product-options" />
            </Field>
            <Field label="금액 (원)">
              <input type="number" value={d.amount} onChange={(e) => field('amount', e.target.value)} className="input-field" style={inputBig} />
            </Field>
            <Field label="구매일">
              <input type="date" value={d.purchaseDate} onChange={(e) => field('purchaseDate', e.target.value)} className="input-field" style={inputBig} />
            </Field>
            <Field label="목표 반영">
              <select
                value={d.goalCategory ?? ''}
                onChange={(e) => field('goalCategory', (e.target.value || null) as GoalCategory | null)}
                className="input-field"
                style={inputBig}
              >
                <option value="">없음</option>
                {(Object.keys(GOAL_CATEGORY_LABEL) as GoalCategory[]).map((key) => (
                  <option key={key} value={key}>
                    {GOAL_CATEGORY_LABEL[key]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="한약 수령일 (해피콜 기준일)">
              <input type="date" value={d.happyCallDate} onChange={(e) => field('happyCallDate', e.target.value)} className="input-field" style={inputBig} />
            </Field>
            <Field label="처방일수 (한약일 때만)">
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                {DURATION_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => field('durationDays', String(n))}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--color-line)',
                      background: d.durationDays === String(n) ? 'var(--color-brand-b)' : 'var(--color-surface)',
                      color: d.durationDays === String(n) ? '#fff' : 'var(--color-ink)',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {n}일
                  </button>
                ))}
                <input type="number" placeholder="직접" value={d.durationDays} onChange={(e) => field('durationDays', e.target.value)} className="input-field" style={{ ...inputBig, width: 80 }} />
              </div>
            </Field>
          </div>
          <Field label="메모" style={{ marginBottom: 12 }}>
            <input value={d.memo} onChange={(e) => field('memo', e.target.value)} className="input-field" style={inputBig} />
          </Field>
          <p className="muted-text" style={{ fontSize: 13, margin: '0 0 14px' }}>
            수령일·처방일수를 바꾸면 아직 걸지 않은 해피콜 일정이 다시 계산돼요. 이미 처리한 콜은 그대로예요. 등록자: {creatorLabel(p.createdBy, staffNames)}
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => saveEdit(p)} disabled={saving || invalid} className="btn-primary" style={{ padding: '10px 26px', fontSize: 15 }}>
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={cancelEdit}
              style={{ padding: '10px 20px', fontSize: 15, fontWeight: 600, border: '1px solid var(--color-line)', background: 'var(--color-surface)', borderRadius: 10 }}
            >
              취소
            </button>
            {invalid && <span className="muted-text" style={{ fontSize: 13 }}>환자 성함, 차트번호, 상품은 비울 수 없어요</span>}
          </div>
        </td>
      </tr>
    );
  }

  function viewRow(p: NonCoveredPurchase) {
    const callDates = p.happyCallDate && p.durationDays ? computeHerbCallDates(p.happyCallDate, p.durationDays) : null;
    return (
      <tr key={p.id} style={{ borderTop: '1px solid var(--color-line)' }}>
        <td style={cell}>{shortDate(p.purchaseDate)}</td>
        <td style={{ ...cell, fontWeight: 700, fontSize: 15 }}>{p.patientName}</td>
        <td style={cell} className="muted-text">
          {p.chartNo}
        </td>
        <td style={cell}>{p.category}</td>
        <td style={{ ...cell, fontWeight: 600 }}>{p.productName}</td>
        <td style={{ ...cell, fontWeight: 700 }}>{p.amount != null ? formatAmount(p.amount) : <MissingAmountChip />}</td>
        <td
          style={cell}
          title={callDates ? `해피콜 1차 ${callDates.callDate1} · 2차 ${callDates.callDate2} · 3차 ${callDates.callDate3}` : undefined}
        >
          {p.happyCallDate ? (
            <span>
              수령 {monthDay(p.happyCallDate)}
              {p.durationDays ? ` · ${p.durationDays}일` : ''}
            </span>
          ) : (
            <span className="muted-text">-</span>
          )}
        </td>
        <td style={cell} className="muted-text">
          {p.goalCategory ? GOAL_CATEGORY_LABEL[p.goalCategory] : '-'}
        </td>
        <td style={{ ...cell, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} className="muted-text" title={p.memo ?? ''}>
          {p.memo ?? ''}
        </td>
        <td style={{ ...cell, fontSize: 13 }} className="muted-text">
          {creatorLabel(p.createdBy, staffNames)}
        </td>
        <td style={cell}>
          <button
            onClick={() => {
              setEditingId(p.id);
              setDraft(toDraft(p));
            }}
            style={{ border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-brand-b)', fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 8, marginRight: 6 }}
          >
            수정
          </button>
          <button
            onClick={() => onDelete(p)}
            style={{ border: '1px solid var(--color-line)', background: 'var(--color-surface)', color: 'var(--color-error)', fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 8 }}
          >
            삭제
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div className="card" style={{ overflowX: 'auto', marginBottom: 24 }}>
      <datalist id="non-covered-product-options">
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>
      <table style={{ width: '100%', minWidth: 1000, borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: 'var(--color-surface-2)' }}>
            {HEADERS.map((h, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '12px 12px', fontSize: 13, whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={HEADERS.length} style={{ padding: 24, textAlign: 'center' }} className="muted-text">
                기록이 없어요.
              </td>
            </tr>
          ) : (
            rows.map((p) => (editingId === p.id && draft ? editRow(p, draft) : viewRow(p)))
          )}
        </tbody>
      </table>
    </div>
  );
}
