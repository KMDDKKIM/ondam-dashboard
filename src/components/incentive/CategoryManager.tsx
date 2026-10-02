'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useState } from 'react';
import type { IncentiveCalcType, IncentiveCategory } from '@/lib/incentive';

interface CategoryManagerProps {
  profileId: string;
  categories: IncentiveCategory[];
  /** 원장만 항목을 추가·수정·비활성화할 수 있다. 부원장 본인은 읽기만. */
  editable: boolean;
  onChanged: () => void;
}

interface CategoryForm {
  name: string;
  color: string;
  calcType: IncentiveCalcType;
  percent: string;
  fixedAmount: string;
}

const DEFAULT_COLOR = '#c0392b';

function emptyForm(): CategoryForm {
  return { name: '', color: DEFAULT_COLOR, calcType: 'percent_of_amount', percent: '10', fixedAmount: '5000' };
}

// 항목(구분)·인센티브 비율 설정 — 원장이 자유롭게 조절할 수 있게 한다(하드코딩 금지 요청).
// 배지를 눌러 기존 항목을 이름·색·비율까지 그대로 고칠 수 있다(언제든 수정 가능 요청, 2026-10-02).
// 한 번 설정해 두면 자주 고칠 일이 없어서, 접으면 비율까지 전부 숨긴다(제목만 남김, 2026-10-02).
export function CategoryManager({ profileId, categories, editable, onChanged }: CategoryManagerProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEdit(c: IncentiveCategory) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      color: c.color,
      calcType: c.calcType,
      percent: String(Math.round((c.percent ?? 0) * 100)),
      fixedAmount: String(c.fixedAmount ?? 0),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      color: form.color,
      calcType: form.calcType,
      percent: form.calcType === 'percent_of_amount' ? (Number(form.percent) || 0) / 100 : null,
      fixedAmount: form.calcType === 'fixed_per_entry' ? Number(form.fixedAmount) || 0 : null,
    };
    try {
      const res = editingId
        ? await fetch(`/api/incentive/categories/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/incentive/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId, sortOrder: categories.length, ...payload }),
          });
      if (!res.ok) throw new Error();
      setForm(emptyForm());
      setEditingId(null);
      onChanged();
    } catch {
      setError(editingId ? '수정하지 못했습니다.' : '추가하지 못했습니다.');
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

  // 항목을 한 칸 앞/뒤로 옮긴다. 화면에 보이는 순서 그대로 0부터 다시 매겨서 전부 저장한다
  // (sortOrder 값 자체는 화면에 안 내려오므로, 어긋나 있어도 이렇게 하면 항상 맞게 정리된다).
  async function moveCategory(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setSaving(true);
    setError('');
    try {
      await Promise.all(
        reordered.map((c, i) =>
          fetch(`/api/incentive/categories/${c.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sortOrder: i }),
          })
        )
      );
      onChanged();
    } catch {
      setError('순서를 바꾸지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: open ? 10 : 0 }}>
        <span style={{ fontWeight: 700 }}>항목·비율</span>
        {editable && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="muted-text"
            style={{ background: 'none', border: 'none', textDecoration: 'underline' }}
          >
            {open ? '접기' : '펼치기'}
          </button>
        )}
      </div>

      {open && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {categories.length === 0 ? (
              <p className="muted-text" style={{ margin: 0 }}>아직 항목이 없어요.</p>
            ) : (
              categories.map((c, i) => (
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
                    outline: editingId === c.id ? '2px solid var(--color-ink)' : undefined,
                  }}
                >
                  {editable && i > 0 && (
                    <button type="button" onClick={() => moveCategory(i, -1)} disabled={saving} title="앞으로" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                      ◀
                    </button>
                  )}
                  {c.name}
                  {c.calcType === 'percent_of_amount' ? ` · ${Math.round((c.percent ?? 0) * 100)}%` : ` · ${(c.fixedAmount ?? 0).toLocaleString('ko-KR')}원/건`}
                  {editable && i < categories.length - 1 && (
                    <button type="button" onClick={() => moveCategory(i, 1)} disabled={saving} title="뒤로" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                      ▶
                    </button>
                  )}
                  {editable && (
                    <>
                      <button type="button" onClick={() => startEdit(c)} title="이름·색·비율 고치기" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                        ✎
                      </button>
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

          {editable && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--color-line)' }}>
              <div>
                <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>이름</label>
                <input className="input-field" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="예: 한약(티케팅)" style={{ width: 140 }} />
              </div>
              <div>
                <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>색상</label>
                <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} style={{ width: 40, height: 34, padding: 2 }} />
              </div>
              <div>
                <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>계산 방식</label>
                <select className="input-field" value={form.calcType} onChange={(e) => setForm((f) => ({ ...f, calcType: e.target.value as typeof f.calcType }))} style={{ width: 150 }}>
                  <option value="percent_of_amount">결제금액 × 비율</option>
                  <option value="fixed_per_entry">건당 고정 금액</option>
                </select>
              </div>
              {form.calcType === 'percent_of_amount' ? (
                <div>
                  <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>비율(%)</label>
                  <input className="input-field" type="number" min={0} max={100} value={form.percent} onChange={(e) => setForm((f) => ({ ...f, percent: e.target.value }))} style={{ width: 80 }} />
                </div>
              ) : (
                <div>
                  <label className="muted-text" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>건당 금액(원)</label>
                  <input className="input-field" type="number" min={0} value={form.fixedAmount} onChange={(e) => setForm((f) => ({ ...f, fixedAmount: e.target.value }))} style={{ width: 100 }} />
                </div>
              )}
              <button type="submit" className="btn-primary" disabled={saving} style={{ padding: '7px 16px' }}>
                {saving ? '저장 중...' : editingId ? '저장' : '항목 추가'}
              </button>
              {editingId && (
                <button type="button" onClick={startAdd} className="muted-text" style={{ background: 'none', border: 'none', textDecoration: 'underline', padding: '7px 0' }}>
                  취소하고 새로 추가하기
                </button>
              )}
            </form>
          )}
          {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
        </>
      )}
    </div>
  );
}
