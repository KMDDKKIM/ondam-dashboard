'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useMemo, useState } from 'react';
import {
  HappyCallSyncError,
  createNonCoveredPurchase,
  deleteNonCoveredPurchase,
  listKnownPatients,
  updateNonCoveredPurchase,
  type EditableNonCoveredPurchase,
} from '@/lib/supabase/nonCoveredPurchases';
import { addNonCoveredProduct } from '@/lib/supabase/nonCoveredProducts';
import { orderCategories } from '@/lib/nonCoveredStats';
import type { NonCoveredPurchase } from '@/lib/types';
import { ProductManager } from '@/components/non-covered/ProductManager';
import { PurchaseForm, type PurchaseFormValues } from '@/components/non-covered/PurchaseForm';
import { PurchaseTable } from '@/components/non-covered/PurchaseTable';
import { smallBtn } from '@/components/non-covered/shared';
import { useNonCoveredData } from '@/components/non-covered/useNonCoveredData';

const GENERAL = '일반';

// 구매 기록: 비급여 구매를 등록하고(해피콜이 자동으로 만들어진다) 목록에서 고치거나 지운다.
export default function NonCoveredRecordsPage() {
  const { supabase, purchases, products, setProducts, staffNames, loading, error, setError, load } = useNonCoveredData();
  const [showForm, setShowForm] = useState(false);
  const [showProductManager, setShowProductManager] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('전체');

  const knownPatients = useMemo(() => listKnownPatients(purchases), [purchases]);
  const categories = useMemo(() => {
    const ordered = orderCategories(purchases);
    return ordered.includes(GENERAL) ? ordered : [GENERAL, ...ordered];
  }, [purchases]);
  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    purchases.forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1));
    return counts;
  }, [purchases]);
  const filtered = activeTab === '전체' ? purchases : purchases.filter((p) => p.category === activeTab);

  async function handleSubmit(values: PurchaseFormValues) {
    setSubmitting(true);
    setError('');
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { isCustomProduct, ...input } = values;
      await createNonCoveredPurchase(supabase, { ...input, createdBy: user?.id ?? null });
      // 직접 입력한 상품명은 다음부터 목록에서 고를 수 있게 저장한다(실패해도 등록은 유지).
      if (isCustomProduct && !products.some((p) => p.name === input.productName)) {
        await addNonCoveredProduct(supabase, input.productName, products).catch(() => {});
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof HappyCallSyncError ? err.message : '등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSave(existing: NonCoveredPurchase, patch: EditableNonCoveredPurchase): Promise<boolean> {
    setError('');
    try {
      await updateNonCoveredPurchase(supabase, existing, patch);
      await load();
      return true;
    } catch (err) {
      if (err instanceof HappyCallSyncError) {
        // 구매는 저장됐고 해피콜 일정만 다 맞추지 못한 경우 — 편집을 닫고 알린다.
        setError(err.message);
        await load();
        return true;
      }
      setError('수정에 실패했습니다.');
      return false;
    }
  }

  async function handleDelete(purchase: NonCoveredPurchase) {
    if (!await confirmDialog('이 기록을 삭제할까요? 이 구매로 예정된 해피콜도 함께 지워져요.')) return;
    setError('');
    try {
      await deleteNonCoveredPurchase(supabase, purchase);
      await load();
    } catch (err) {
      setError(err instanceof HappyCallSyncError ? err.message : '삭제에 실패했습니다.');
      await load();
    }
  }

  if (loading) return <p className="muted-text">불러오는 중...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        <button onClick={() => setShowProductManager((v) => !v)} style={{ ...smallBtn, padding: '11px 16px', fontSize: 14, fontWeight: 600 }}>
          상품 목록 관리
        </button>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + 등록
        </button>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      {showProductManager && <ProductManager supabase={supabase} products={products} onProductsChange={setProducts} onError={setError} />}

      {showForm && (
        <PurchaseForm
          products={products}
          categories={categories}
          defaultCategory={activeTab !== '전체' ? activeTab : GENERAL}
          knownPatients={knownPatients}
          submitting={submitting}
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['전체', ...categories].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '9px 18px',
              borderRadius: 999,
              border: '1px solid var(--color-line)',
              background: activeTab === tab ? 'var(--color-brand-b)' : 'var(--color-surface)',
              color: activeTab === tab ? '#fff' : 'var(--color-ink)',
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {tab}
            {tab !== '전체' && countByCategory.has(tab) ? ` (${countByCategory.get(tab)})` : ''}
          </button>
        ))}
      </div>

      <PurchaseTable rows={filtered} products={products} staffNames={staffNames} onSave={handleSave} onDelete={handleDelete} />
    </div>
  );
}
