'use client';

import { useState } from 'react';
import { computeHerbCallDates } from '@/lib/happyCallStats';
import type { EditableNonCoveredPurchase } from '@/lib/supabase/nonCoveredPurchases';
import type { GoalCategory, NonCoveredProduct, NonCoveredPurchase } from '@/lib/types';
import { GOAL_CATEGORY_LABEL, formatAmount } from './shared';

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

const HEADERS = ['환자명', '차트번호', '연락처', '구분', '상품명', '금액', '구매일', '한약수령일/해피콜', '목표', '메모', '등록자', ''];

const cell = { padding: '10px 12px' } as const;
const editCell = { padding: 6 } as const;

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
        fontSize: 11,
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

  function editRow(p: NonCoveredPurchase, d: Draft) {
    return (
      <tr key={p.id} style={{ borderTop: '1px solid var(--color-line)', background: 'var(--color-surface-2)' }}>
        <td style={editCell}>
          <input value={d.patientName} onChange={(e) => field('patientName', e.target.value)} className="input-field" style={{ minWidth: 90 }} />
        </td>
        <td style={editCell}>
          <input value={d.chartNo} onChange={(e) => field('chartNo', e.target.value)} className="input-field" style={{ minWidth: 90 }} />
        </td>
        <td style={editCell}>
          <input value={d.phone} onChange={(e) => field('phone', e.target.value)} className="input-field" style={{ minWidth: 110 }} />
        </td>
        <td style={editCell}>
          <input value={d.category} onChange={(e) => field('category', e.target.value)} className="input-field" style={{ minWidth: 90 }} />
        </td>
        <td style={editCell}>
          <input value={d.productName} onChange={(e) => field('productName', e.target.value)} className="input-field" style={{ minWidth: 110 }} list="non-covered-product-options" />
        </td>
        <td style={editCell}>
          <input type="number" value={d.amount} onChange={(e) => field('amount', e.target.value)} className="input-field" style={{ minWidth: 90 }} />
        </td>
        <td style={editCell}>
          <input type="date" value={d.purchaseDate} onChange={(e) => field('purchaseDate', e.target.value)} className="input-field" style={{ minWidth: 140 }} />
        </td>
        <td style={editCell}>
          <input type="date" value={d.happyCallDate} onChange={(e) => field('happyCallDate', e.target.value)} className="input-field" style={{ minWidth: 140, marginBottom: 4 }} />
          <input type="number" placeholder="처방일수" value={d.durationDays} onChange={(e) => field('durationDays', e.target.value)} className="input-field" style={{ minWidth: 90 }} />
          <div className="muted-text" style={{ fontSize: 11, marginTop: 4 }}>
            바꾸면 아직 걸지 않은 해피콜 일정이 다시 계산돼요. 이미 처리한 콜은 그대로예요.
          </div>
        </td>
        <td style={editCell}>
          <select
            value={d.goalCategory ?? ''}
            onChange={(e) => field('goalCategory', (e.target.value || null) as GoalCategory | null)}
            className="input-field"
          >
            <option value="">없음</option>
            {(Object.keys(GOAL_CATEGORY_LABEL) as GoalCategory[]).map((key) => (
              <option key={key} value={key}>
                {GOAL_CATEGORY_LABEL[key]}
              </option>
            ))}
          </select>
        </td>
        <td style={editCell}>
          <input value={d.memo} onChange={(e) => field('memo', e.target.value)} className="input-field" style={{ minWidth: 110 }} />
        </td>
        <td style={editCell} className="muted-text">
          {creatorLabel(p.createdBy, staffNames)}
        </td>
        <td style={{ ...editCell, whiteSpace: 'nowrap' }}>
          <button onClick={() => saveEdit(p)} disabled={saving} className="btn-primary" style={{ padding: '4px 10px', fontSize: 12, marginRight: 4 }}>
            저장
          </button>
          <button
            onClick={cancelEdit}
            style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--color-line)', background: 'var(--color-surface)', borderRadius: 8 }}
          >
            취소
          </button>
        </td>
      </tr>
    );
  }

  function viewRow(p: NonCoveredPurchase) {
    const callDates = p.happyCallDate && p.durationDays ? computeHerbCallDates(p.happyCallDate, p.durationDays) : null;
    return (
      <tr key={p.id} style={{ borderTop: '1px solid var(--color-line)' }}>
        <td style={{ ...cell, fontWeight: 600 }}>{p.patientName}</td>
        <td style={cell}>{p.chartNo}</td>
        <td style={cell}>{p.phone ?? '-'}</td>
        <td style={cell}>{p.category}</td>
        <td style={cell}>{p.productName}</td>
        <td style={cell}>{p.amount != null ? formatAmount(p.amount) : <MissingAmountChip />}</td>
        <td style={cell}>{p.purchaseDate}</td>
        <td style={{ ...cell, fontSize: 12 }}>
          {callDates ? (
            <span className="muted-text">
              {p.happyCallDate} (처방{p.durationDays}일)
              <br />
              1차 {callDates.callDate1} · 2차 {callDates.callDate2} · 3차 {callDates.callDate3}
            </span>
          ) : (
            p.happyCallDate ?? '-'
          )}
        </td>
        <td style={cell} className="muted-text">
          {p.goalCategory ? GOAL_CATEGORY_LABEL[p.goalCategory] : '-'}
        </td>
        <td style={cell} className="muted-text">
          {p.memo ?? ''}
        </td>
        <td style={cell} className="muted-text">
          {creatorLabel(p.createdBy, staffNames)}
        </td>
        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
          <button
            onClick={() => {
              setEditingId(p.id);
              setDraft(toDraft(p));
            }}
            style={{ border: 'none', background: 'transparent', color: 'var(--color-brand-b)', fontSize: 12, fontWeight: 600, marginRight: 6 }}
          >
            수정
          </button>
          <button onClick={() => onDelete(p)} style={{ border: 'none', background: 'transparent', color: 'var(--color-error)', fontSize: 12, fontWeight: 600 }}>
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
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--color-surface-2)' }}>
            {HEADERS.map((h, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '10px 12px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={HEADERS.length} style={{ padding: 16, textAlign: 'center' }} className="muted-text">
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
