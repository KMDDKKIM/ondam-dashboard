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
import { RevenueCharts } from '@/components/non-covered/RevenueCharts';
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
  const [selectedMonth, setSelectedMonth] = useState(todayKst().slice(0, 7));
  // 화면 나누기: 월별 현황·기록 / 월별 비교
  const [view, setView] = useState<'status' | 'compare'>('status');

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

  const viewTab = (key: 'status' | 'compare', label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setView(key)}
      aria-pressed={view === key}
      style={{
        padding: '9px 20px',
        borderRadius: 999,
        border: '1px solid var(--color-line)',
        background: view === key ? 'var(--color-brand-b)' : 'var(--color-surface)',
        color: view === key ? '#fff' : 'var(--color-ink)',
        fontSize: 14,
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>비급여 현황</h1>
        <p className="muted-text">비급여 구매를 구분(일반/이벤트)별로 한눈에 보고 기록하세요.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }} role="tablist" aria-label="비급여 현황 화면">
        {viewTab('status', '월별 현황 · 기록')}
        {viewTab('compare', '월별 비교')}
      </div>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      {view === 'compare' ? (
        <>
          <RevenueCharts purchases={purchases} currentMonth={currentMonth} selectedMonth={selectedMonth} onSelectMonth={setSelectedMonth} />
          <MonthlyTrend purchases={purchases} currentMonth={currentMonth} />
          {eventCategories.length > 0 && (
            <EventComparison purchases={purchases} categories={categories} eventCategories={eventCategories} />
          )}
          {purchases.length === 0 && <p className="muted-text">아직 비급여 기록이 없어요. 「월별 현황 · 기록」에서 구매를 등록하면 여기에 그래프가 나타나요.</p>}
        </>
      ) : (
        <>
          {/* 맨 위: 월별 현황(달을 눌러 바꾸면 그 달의 상품별 매출이 나온다) */}
          <MonthStats purchases={purchases} currentMonth={currentMonth} month={selectedMonth} onMonthChange={setSelectedMonth} />

          {/* 아래: 구매 기록 입력과 목록 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '28px 0 14px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 18 }}>구매 기록</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowProductManager((v) => !v)} style={{ ...smallBtn, padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>
                상품 목록 관리
              </button>
              <button className="btn-primary" onClick={() => setShowForm(true)}>
                + 등록
              </button>
            </div>
          </div>

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
        </>
      )}
    </div>
  );
}
