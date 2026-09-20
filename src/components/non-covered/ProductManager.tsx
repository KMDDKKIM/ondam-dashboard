'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addNonCoveredProduct,
  deleteNonCoveredProduct,
  listNonCoveredProducts,
  renameNonCoveredProduct,
} from '@/lib/supabase/nonCoveredProducts';
import type { NonCoveredProduct } from '@/lib/types';
import { linkBtn, smallBtn } from './shared';

interface Props {
  supabase: SupabaseClient;
  products: NonCoveredProduct[];
  onProductsChange: (products: NonCoveredProduct[]) => void;
  onError: (message: string) => void;
}

export function ProductManager({ supabase, products, onProductsChange, onError }: Props) {
  const [newProductName, setNewProductName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  async function handleAdd() {
    const value = newProductName.trim();
    if (!value) return;
    if (products.some((p) => p.name === value)) {
      onError('이미 있는 상품명이에요.');
      return;
    }
    try {
      onError('');
      await addNonCoveredProduct(supabase, value, products);
      setNewProductName('');
      onProductsChange(await listNonCoveredProducts(supabase));
    } catch {
      onError('상품을 추가하지 못했습니다.');
    }
  }

  async function handleRename(id: string) {
    const value = renameText.trim();
    if (!value) return;
    if (products.some((p) => p.id !== id && p.name === value)) {
      onError('이미 있는 상품명이에요.');
      return;
    }
    try {
      onError('');
      await renameNonCoveredProduct(supabase, id, value);
      setRenamingId(null);
      onProductsChange(await listNonCoveredProducts(supabase));
    } catch {
      onError('상품 이름을 수정하지 못했습니다.');
    }
  }

  async function handleDelete(p: NonCoveredProduct) {
    if (!window.confirm(`"${p.name}"을(를) 상품 목록에서 삭제할까요? (이미 등록된 기록은 그대로 남아요)`)) return;
    try {
      onError('');
      await deleteNonCoveredProduct(supabase, p.id);
      onProductsChange(await listNonCoveredProducts(supabase));
    } catch {
      onError('상품을 삭제하지 못했습니다.');
    }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>상품 목록 관리</div>
      <p className="muted-text" style={{ marginBottom: 10 }}>
        등록 화면에서 고를 수 있는 상품명이에요. 이름을 고치거나 지워도 이미 등록된 기록은 그대로 남아요.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {products.map((p) =>
          renamingId === p.id ? (
            <span key={p.id} style={{ display: 'inline-flex', gap: 4 }}>
              <input
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(p.id);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                className="input-field"
                style={{ width: 150, padding: '4px 8px' }}
                autoFocus
              />
              <button type="button" onClick={() => handleRename(p.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}>
                저장
              </button>
              <button type="button" onClick={() => setRenamingId(null)} style={smallBtn}>
                취소
              </button>
            </span>
          ) : (
            <span
              key={p.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid var(--color-line)',
                background: 'var(--color-surface-2)',
                fontSize: 13,
              }}
            >
              {p.name}
              <button
                type="button"
                onClick={() => {
                  setRenamingId(p.id);
                  setRenameText(p.name);
                }}
                style={linkBtn}
              >
                수정
              </button>
              <button type="button" onClick={() => handleDelete(p)} style={{ ...linkBtn, color: 'var(--color-error)' }}>
                삭제
              </button>
            </span>
          )
        )}
        {products.length === 0 && <span className="muted-text">등록된 상품이 없어요.</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="새 상품명"
          value={newProductName}
          onChange={(e) => setNewProductName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
          className="input-field"
          style={{ maxWidth: 220 }}
        />
        <button type="button" onClick={handleAdd} className="btn-primary" style={{ padding: '8px 16px' }}>
          추가
        </button>
      </div>
    </div>
  );
}
