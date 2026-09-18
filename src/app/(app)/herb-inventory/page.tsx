'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listHerbInventory,
  createHerbInventoryItem,
  adjustHerbStock,
} from '@/lib/supabase/herbInventory';
import { parseBulkHerbEntry } from '@/lib/herbEntryParser';
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
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('봉지');
  const [newStock, setNewStock] = useState('');
  const [newThreshold, setNewThreshold] = useState('');

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

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createHerbInventoryItem(supabase, {
        name: newName.trim(),
        unit: newUnit.trim() || '봉지',
        currentStock: Number(newStock) || 0,
        lowStockThreshold: newThreshold ? Number(newThreshold) : null,
        createdBy: user?.id ?? null,
      });
      setNewName('');
      setNewUnit('봉지');
      setNewStock('');
      setNewThreshold('');
      setShowAddForm(false);
      await load();
    } catch {
      setError('약재 추가에 실패했습니다. 같은 이름이 이미 있는지 확인해주세요.');
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
      {warning && (
        <p style={{ color: 'var(--color-gold)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          ⚠️ {warning}
        </p>
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
        <form
          onSubmit={handleAdd}
          className="card"
          style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <input
            placeholder="약재명"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="input-field"
            style={{ maxWidth: 160 }}
          />
          <input
            placeholder="단위 (봉지, g 등)"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            className="input-field"
            style={{ maxWidth: 130 }}
          />
          <input
            type="number"
            placeholder="현재 재고"
            value={newStock}
            onChange={(e) => setNewStock(e.target.value)}
            className="input-field"
            style={{ maxWidth: 110 }}
          />
          <input
            type="number"
            placeholder="부족 기준 (선택)"
            value={newThreshold}
            onChange={(e) => setNewThreshold(e.target.value)}
            className="input-field"
            style={{ maxWidth: 130 }}
          />
          <button type="submit" className="btn-primary" style={{ padding: '10px 16px' }}>
            추가
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
            const low = item.lowStockThreshold != null && item.currentStock <= item.lowStockThreshold;
            const isActive = active?.id === item.id;
            return (
              <div
                key={item.id}
                className="card"
                style={{
                  padding: 18,
                  borderColor: low ? 'var(--color-error)' : 'var(--color-line)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{item.name}</span>
                  {low && (
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
                      부족
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
                  {item.currentStock.toLocaleString()}
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-muted)' }}> {item.unit}</span>
                </div>
                {item.lowStockThreshold != null && (
                  <div className="muted-text" style={{ marginBottom: 12 }}>
                    부족 기준 {item.lowStockThreshold}
                    {item.unit}
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
