'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useState } from 'react';
import type { IncentiveCategory } from '@/lib/incentive';

interface CategoryManagerProps {
  profileId: string;
  categories: IncentiveCategory[];
  /** 원장만 항목을 추가·수정·비활성화할 수 있다. 부원장 본인은 읽기만. */
  editable: boolean;
  onChanged: () => void;
}

const DEFAULT_COLOR = '#c0392b';

// 항목(구분)·인센티브 비율 설정 — 원장이 자유롭게 조절할 수 있게 한다(하드코딩 금지 요청).
export function CategoryManager({ profileId, categories, editable, onChanged }: CategoryManagerProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [calcType, setCalcType] = useState<'percent_of_amount' | 'fixed_per_entry'>('percent_of_amount');
  const [percent, setPercent] = useState('10');
  const [fixedAmount, setFixedAmount] = useState('5000');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/incentive/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          name: name.trim(),
          color,
          calcType,
          percent: calcType === 'percent_of_amount' ? (Number(percent) || 0) / 100 : null,
          fixedAmount: calcType === 'fixed_per_entry' ? Number(fixedAmount) || 0 : null,
          sortOrder: categories.length,
        }),
      });
      if (!res.ok) throw new Error();
      setName('');
      onChanged();
    } catch {
      setError('추가하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function setActive(categoryId: string, active: boolean) {
    try {
      const res = await fetch(`/api/incentive/categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error();
      onChanged();
    } catch {
      setError('수정하지 못했습니다.');
    }
  }

  async function handleDelete(category: IncentiveCategory) {
    if (!(await confirmDialog(`"${category.name}" 항목을 삭제할까요? 이미 입력된 기록이 있으면 대신 비활성화됩니다.`))) return;
    try {
      const res = await fetch(`/api/incentive/categories/${category.id}`, { method: 'DELETE' });
      if (res.status === 409) {
        // 이미 입력된 내역이 참조 중이라 DB가 삭제를 막았다 — 대신 비활성화한다.
        await setActive(category.id, false);
        return;
      }
      if (!res.ok) throw new Error();
      onChanged();
    } catch {
      setError('삭제하지 못했습니다.');
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 700 }}>항목·인센티브 비율</span>
        {editable && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="muted-text" style={{ background: 'none', border: 'none', textDecoration: 'underline' }}>
            {open ? '접기' : '항목 추가/편집'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: open ? 14 : 0 }}>
        {categories.length === 0 ? (
          <p className="muted-text" style={{ margin: 0 }}>아직 항목이 없어요.</p>
        ) : (
          categories.map((c) => (
            <span
              key={c.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                background: c.color,
                opacity: c.active ? 1 : 0.4,
              }}
            >
              {c.name}
              {c.calcType === 'percent_of_amount' ? ` · ${Math.round((c.percent ?? 0) * 100)}%` : ` · ${(c.fixedAmount ?? 0).toLocaleString('ko-KR')}원/건`}
              {editable && (
                <>
                  <button type="button" onClick={() => setActive(c.id, !c.active)} title={c.active ? '비활성화' : '다시 활성화'} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                    {c.active ? '⏸' : '▶'}
                  </button>
                  <button type="button" onClick={() => handleDelete(c)} title="삭제" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                    ✕
                  </button>
                </>
              )}
            </span>
          ))
        )}
      </div>

      {editable && open && (
        <form onSubmit={handleAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--color-line)' }}>
          <div>
            <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>이름</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 한약(티케팅)" style={{ width: 140 }} />
          </div>
          <div>
            <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>색상</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 40, height: 34, padding: 2 }} />
          </div>
          <div>
            <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>계산 방식</label>
            <select className="input-field" value={calcType} onChange={(e) => setCalcType(e.target.value as typeof calcType)} style={{ width: 150 }}>
              <option value="percent_of_amount">결제금액 × 비율</option>
              <option value="fixed_per_entry">건당 고정 금액</option>
            </select>
          </div>
          {calcType === 'percent_of_amount' ? (
            <div>
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>비율(%)</label>
              <input className="input-field" type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} style={{ width: 80 }} />
            </div>
          ) : (
            <div>
              <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>건당 금액(원)</label>
              <input className="input-field" type="number" min={0} value={fixedAmount} onChange={(e) => setFixedAmount(e.target.value)} style={{ width: 100 }} />
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '7px 16px' }}>
            {saving ? '추가 중...' : '항목 추가'}
          </button>
        </form>
      )}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
