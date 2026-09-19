'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listHerbInventory,
  createHerbInventoryItems,
  deleteHerbInventoryItem,
  adjustHerbStock,
} from '@/lib/supabase/herbInventory';
import { parseBulkHerbEntry, parseNewHerbs } from '@/lib/herbEntryParser';
import type { HerbInventoryItem } from '@/lib/types';

type ActiveAction = { id: string; type: 'use' | 'restock' } | null;

function warningText(unmatched: string[], dangling: string[]): string {
  const parts: string[] = [];
  if (unmatched.length > 0) {
    parts.push(`목록에 없는 약재라 반영 안 됨: ${unmatched.join(', ')} — 먼저 "+ 약재 추가"로 등록해주세요.`);
  }
  if (dangling.length > 0) {
    parts.push(`개수가 안 붙어서 반영 안 됨: ${dangling.join(', ')}`);
  }
  return parts.join(' / ');
}

export default function HerbInventoryPage() {
  const [items, setItems] = useState<HerbInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newHerbsText, setNewHerbsText] = useState('');
  const [addingHerbs, setAddingHerbs] = useState(false);
  const [notice, setNotice] = useState('');

  const [restockText, setRestockText] = useState('');
  const [useText, setUseText] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState<'restock' | 'use' | null>(null);

  const [active, setActive] = useState<ActiveAction>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  async function load() {
    setLoading(true);
    setError('');
    try {
      const rows = await listHerbInventory(supabase);
      setItems(rows);
    } catch {
      setError('불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 여러 약재를 한 번에 등록한다. 이미 있는 이름은 건너뛰고(재고를 덮어쓰지 않는다),
  // 나머지는 한 번의 insert로 같이 넣어서 중간에 일부만 들어가는 일이 없게 한다.
  async function handleAddHerbs(event: FormEvent) {
    event.preventDefault();
    const { entries, duplicateNames } = parseNewHerbs(newHerbsText);
    if (entries.length === 0) return;

    const existing = new Set(items.map((i) => i.name));
    const toAdd = entries.filter((e) => !existing.has(e.name));
    const skipped = entries.filter((e) => existing.has(e.name)).map((e) => e.name);

    const warnings: string[] = [];
    if (skipped.length > 0) warnings.push(`이미 있어서 건너뜀: ${skipped.join(', ')}`);
    if (duplicateNames.length > 0) warnings.push(`중복 입력이라 처음 것만 사용: ${duplicateNames.join(', ')}`);
    setWarning(warnings.join(' / '));
    setError('');
    setNotice('');
    if (toAdd.length === 0) return;

    setAddingHerbs(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createHerbInventoryItems(
        supabase,
        toAdd.map((e) => ({ name: e.name, currentStock: e.stock, createdBy: user?.id ?? null }))
      );
      const noStock = toAdd.filter((e) => e.missingStock).map((e) => e.name);
      setNotice(
        `${toAdd.length}개 추가했어요.${noStock.length > 0 ? ` (재고 숫자가 없어 0으로 등록: ${noStock.join(', ')})` : ''}`
      );
      setNewHerbsText('');
      setShowAddForm(false);
      await load();
    } catch {
      setError('약재 추가에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setAddingHerbs(false);
    }
  }

  // "당귀 천궁 3 생강 대조 1" 처럼 처방 적듯이 이름 여러 개 + 개수를 한 번에
  // 입력받아, 목록에 있는 약재만 골라 사용/입고를 한 번에 반영한다. 목록에 없는
  // 이름이나 개수가 안 붙은 이름은 반영하지 않고 warning으로 알려준다.
  async function handleBulkSubmit(type: 'use' | 'restock') {
    const text = type === 'use' ? useText : restockText;
    if (!text.trim()) return;

    const { matched, unmatchedNames, danglingNames } = parseBulkHerbEntry(
      text,
      items.map((i) => i.name)
    );

    setWarning(warningText(unmatchedNames, danglingNames));
    setError('');

    if (matched.length === 0) {
      return;
    }

    setBulkSubmitting(type);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      for (const entry of matched) {
        const item = items.find((i) => i.name === entry.name);
        if (!item) continue;
        await adjustHerbStock(supabase, {
          herbId: item.id,
          changeType: type,
          amount: entry.amount,
          note: '일괄 입력',
          createdBy: user?.id ?? null,
          currentStock: item.currentStock,
        });
      }

      if (type === 'use') setUseText('');
      else setRestockText('');
      await load();
    } catch {
      setError('처리 중 일부가 실패했습니다. 재고를 확인 후 다시 시도해주세요.');
    } finally {
      setBulkSubmitting(null);
    }
  }

  async function handleDeleteHerb(item: HerbInventoryItem) {
    if (!window.confirm(`"${item.name}"을(를) 삭제할까요? 사용·입고 기록도 함께 지워져요.`)) return;
    setError('');
    setNotice('');
    setWarning('');
    try {
      await deleteHerbInventoryItem(supabase, item.id);
      setNotice(`${item.name}을(를) 삭제했어요.`);
      await load();
    } catch {
      setError('삭제하지 못했습니다. (삭제 권한 설정이 아직 안 됐을 수 있어요)');
    }
  }

  function openAction(id: string, type: 'use' | 'restock') {
    setActive({ id, type });
    setAmount('');
    setNote('');
  }

  async function submitAction(item: HerbInventoryItem) {
    if (!active || !amount || Number(amount) <= 0) return;
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await adjustHerbStock(supabase, {
        herbId: item.id,
        changeType: active.type,
        amount: Number(amount),
        note: note.trim() || null,
        createdBy: user?.id ?? null,
        currentStock: item.currentStock,
      });
      setActive(null);
      await load();
    } catch {
      setError('처리에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  const outOfStock = useMemo(() => items.filter((i) => i.currentStock <= 0), [items]);
  const preview = useMemo(() => parseNewHerbs(newHerbsText).entries, [newHerbsText]);

  if (loading) return <p className="muted-text">불러오는 중...</p>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>한약재 재고 현황</h1>
          <p className="muted-text">재고가 부족한 약재를 한눈에 확인하고, 사용·입고를 기록하세요.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddForm((v) => !v)}>
          + 약재 추가
        </button>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
      {notice && (
        <p style={{ color: 'var(--color-green)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>✅ {notice}</p>
      )}
      {warning && (
        <p style={{ color: 'var(--color-gold)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          ⚠️ {warning}
        </p>
      )}

      {outOfStock.length > 0 && (
        <div
          className="card"
          style={{ padding: 16, marginBottom: 20, borderColor: 'var(--color-error)', background: '#fdecea' }}
        >
          <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--color-error)' }}>
            🚨 재고 0 ({outOfStock.length}개)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {outOfStock.map((i) => (
              <span
                key={i.id}
                style={{
                  background: 'var(--color-error)',
                  color: '#fff',
                  borderRadius: 999,
                  padding: '4px 12px',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                {i.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>📥 일괄 입고</div>
          <p className="muted-text" style={{ marginBottom: 8 }}>
            예: 당귀 천궁 3 생강 대조 1
          </p>
          <textarea
            value={restockText}
            onChange={(e) => setRestockText(e.target.value)}
            className="input-field"
            rows={2}
            style={{ resize: 'vertical', marginBottom: 8 }}
          />
          <button
            onClick={() => handleBulkSubmit('restock')}
            disabled={bulkSubmitting === 'restock'}
            className="btn-primary"
            style={{ width: '100%' }}
          >
            입고 반영
          </button>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>📤 일괄 사용</div>
          <p className="muted-text" style={{ marginBottom: 8 }}>
            예: 당귀 생지황 1
          </p>
          <textarea
            value={useText}
            onChange={(e) => setUseText(e.target.value)}
            className="input-field"
            rows={2}
            style={{ resize: 'vertical', marginBottom: 8 }}
          />
          <button
            onClick={() => handleBulkSubmit('use')}
            disabled={bulkSubmitting === 'use'}
            style={{
              width: '100%',
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid var(--color-line)',
              background: 'var(--color-surface-2)',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            사용 반영
          </button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddHerbs} className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>새 약재 여러 개 한 번에 추가</div>
          <p className="muted-text" style={{ marginBottom: 8 }}>
            약재명 뒤에 현재 재고를 적어주세요. 줄바꿈이나 띄어쓰기로 구분하고, 재고가 같은 약재는 이름을 이어 쓴 뒤 숫자를
            한 번만 쓰면 돼요. 예: 당귀 5 천궁 3 생강 대조 1 (엑셀에서 복사해 붙여넣어도 돼요)
          </p>
          <textarea
            value={newHerbsText}
            onChange={(e) => setNewHerbsText(e.target.value)}
            className="input-field"
            rows={5}
            autoFocus
            placeholder={'당귀 5\n천궁 3\n생강 대조 1'}
            style={{ resize: 'vertical', marginBottom: 8 }}
          />
          {preview.length > 0 && (
            <p className="muted-text" style={{ marginBottom: 8 }}>
              추가될 약재 {preview.length}개: {preview.map((p) => `${p.name} ${p.stock}`).join(', ')}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary"
            disabled={addingHerbs || preview.length === 0}
            style={{ padding: '10px 16px' }}
          >
            {addingHerbs ? '추가 중...' : preview.length > 0 ? `${preview.length}개 한 번에 추가` : '한 번에 추가'}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="muted-text">등록된 약재가 없어요. "+ 약재 추가"로 시작하세요.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {items.map((item) => {
            const empty = item.currentStock <= 0;
            const low = !empty && item.lowStockThreshold != null && item.currentStock <= item.lowStockThreshold;
            const isActive = active?.id === item.id;
            return (
              <div
                key={item.id}
                className="card"
                style={{
                  padding: 18,
                  borderColor: low || empty ? 'var(--color-error)' : 'var(--color-line)',
                  background: empty ? '#fdecea' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</span>
                  {(low || empty) && (
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
                <div
                  style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: empty ? 'var(--color-error)' : undefined }}
                >
                  {item.currentStock.toLocaleString()}
                </div>
                {item.lowStockThreshold != null && (
                  <div className="muted-text" style={{ marginBottom: 12 }}>
                    부족 기준 {item.lowStockThreshold}
                  </div>
                )}

                {isActive ? (
                  <div style={{ marginTop: 12 }}>
                    <input
                      type="number"
                      autoFocus
                      placeholder={active.type === 'use' ? '사용량' : '입고량'}
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
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => submitAction(item)}
                        disabled={submitting}
                        className="btn-primary"
                        style={{ flex: 1, padding: '8px 0', fontSize: 13 }}
                      >
                        확인
                      </button>
                      <button
                        onClick={() => setActive(null)}
                        style={{
                          flex: 1,
                          padding: '8px 0',
                          fontSize: 13,
                          borderRadius: 10,
                          border: '1px solid var(--color-line)',
                          background: 'var(--color-surface-2)',
                        }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      onClick={() => openAction(item.id, 'use')}
                      style={{
                        flex: 1,
                        padding: '8px 0',
                        fontSize: 13,
                        borderRadius: 10,
                        border: '1px solid var(--color-line)',
                        background: 'var(--color-surface-2)',
                        fontWeight: 600,
                      }}
                    >
                      사용
                    </button>
                    <button
                      onClick={() => openAction(item.id, 'restock')}
                      className="btn-primary"
                      style={{ flex: 1, padding: '8px 0', fontSize: 13 }}
                    >
                      입고
                    </button>
                  </div>
                )}
                {!isActive && (
                  <button
                    onClick={() => handleDeleteHerb(item)}
                    style={{ border: 'none', background: 'transparent', color: 'var(--color-muted)', fontSize: 12, padding: '10px 0 0' }}
                  >
                    삭제
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
