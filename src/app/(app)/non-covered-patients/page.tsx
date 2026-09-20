'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  HappyCallSyncError,
  createNonCoveredPurchase,
  deleteNonCoveredPurchase,
  listKnownPatients,
  listNonCoveredPurchases,
  updateNonCoveredPurchase,
  type EditableNonCoveredPurchase,
} from '@/lib/supabase/nonCoveredPurchases';
import { addNonCoveredProduct, listNonCoveredProducts } from '@/lib/supabase/nonCoveredProducts';
import { listStaffNames } from '@/lib/supabase/happyCallWorklist';
import { todayKst } from '@/lib/kst';
import { orderCategories } from '@/lib/nonCoveredStats';
import type { NonCoveredProduct, NonCoveredPurchase } from '@/lib/types';
import { EventComparison } from '@/components/non-covered/EventComparison';
import { MonthStats } from '@/components/non-covered/MonthStats';
import { MonthlyTrend } from '@/components/non-covered/MonthlyTrend';
import { ProductManager } from '@/components/non-covered/ProductManager';
import { PurchaseForm, type PurchaseFormValues } from '@/components/non-covered/PurchaseForm';
import { PurchaseTable } from '@/components/non-covered/PurchaseTable';
import { smallBtn } from '@/components/non-covered/shared';

const GENERAL = '일반';

export default function NonCoveredPatientsPage() {
  const [purchases, setPurchases] = useState<NonCoveredPurchase[]>([]);
  const [products, setProducts] = useState<NonCoveredProduct[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showProductManager, setShowProductManager] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('전체');

  const supabase = createClient();
  const currentMonth = todayKst().slice(0, 7);

  // 처음에만 "불러오는 중"을 보여 준다 — 저장 뒤 다시 읽을 때 화면 상태(월 선택 등)가 초기화되지 않게.
  // (오류 메시지는 지우지 않는다: 저장 실패 안내 뒤에 다시 읽어도 안내가 남아 있어야 한다.)
  async function load() {
    try {
      const [rows, productRows, names] = await Promise.all([
        listNonCoveredPurchases(supabase),
        listNonCoveredProducts(supabase).catch(() => [] as NonCoveredProduct[]),
        // 등록자 이름은 부가 정보라 실패해도 목록은 보여 준다.
        listStaffNames(supabase).catch(() => ({}) as Record<string, string>),
      ]);
      setPurchases(rows);
      setProducts(productRows);
      setStaffNames(names);
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

  const knownPatients = useMemo(() => listKnownPatients(purchases), [purchases]);
  const categories = useMemo(() => {
    const ordered = orderCategories(purchases);
    return ordered.includes(GENERAL) ? ordered : [GENERAL, ...ordered];
  }, [purchases]);
  const eventCategories = useMemo(() => categories.filter((c) => c !== GENERAL), [categories]);
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
    if (!window.confirm('이 기록을 삭제할까요? 이 구매로 예정된 해피콜도 함께 지워져요.')) return;
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>비급여 현황</h1>
          <p className="muted-text">비급여 구매를 구분(일반/이벤트)별로 한눈에 보고 기록하세요.</p>
        </div>
        <button
          onClick={() => setShowProductManager((v) => !v)}
          style={{ ...smallBtn, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginRight: 8 }}
        >
          상품 목록 관리
        </button>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + 등록
        </button>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      {showProductManager && (
        <ProductManager supabase={supabase} products={products} onProductsChange={setProducts} onError={setError} />
      )}

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

      <MonthStats purchases={purchases} currentMonth={currentMonth} />
      <MonthlyTrend purchases={purchases} currentMonth={currentMonth} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['전체', ...categories].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '7px 14px',
              borderRadius: 999,
              border: '1px solid var(--color-line)',
              background: activeTab === tab ? 'var(--color-brand-b)' : 'var(--color-surface)',
              color: activeTab === tab ? '#fff' : 'var(--color-ink)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {tab}
            {tab !== '전체' && countByCategory.has(tab) ? ` (${countByCategory.get(tab)})` : ''}
          </button>
        ))}
      </div>

      <PurchaseTable rows={filtered} products={products} staffNames={staffNames} onSave={handleSave} onDelete={handleDelete} />

      {eventCategories.length > 0 && (
        <EventComparison purchases={purchases} categories={categories} eventCategories={eventCategories} />
      )}
    </div>
  );
}
