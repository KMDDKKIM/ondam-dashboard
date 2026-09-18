'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listHerbInventory,
  createHerbInventoryItem,
  adjustHerbStock,
} from '@/lib/supabase/herbInventory';
import type { HerbInventoryItem } from '@/lib/types';

type ActiveAction = { id: string; type: 'use' | 'restock' } | null;

export default function HerbInventoryPage() {
  const [items, setItems] = useState<HerbInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('g');
  const [newStock, setNewStock] = useState('');
  const [newThreshold, setNewThreshold] = useState('');

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
        unit: newUnit.trim() || 'g',
        currentStock: Number(newStock) || 0,
        lowStockThreshold: newThreshold ? Number(newThreshold) : null,
        createdBy: user?.id ?? null,
      });
      setNewName('');
      setNewUnit('g');
      setNewStock('');
      setNewThreshold('');
      setShowAddForm(false);
      await load();
    } catch {
      setError('약재 추가에 실패했습니다. 같은 이름이 이미 있는지 확인해주세요.');
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

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

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
            placeholder="단위 (g, 봉지 등)"
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
