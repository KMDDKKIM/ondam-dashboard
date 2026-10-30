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
import { todayKst } from '@/lib/kst';
import { ALL_CATEGORIES, EXPORT_HEADERS, PERIOD_PRESET_LABEL, exportFileName, filterPurchases, periodRange, purchaseExportRows, summarizePurchases, type PeriodPreset } from '@/lib/purchaseFilter';
import { XLSX_MIME, buildXlsx } from '@/lib/xlsx';
import type { NonCoveredPurchase } from '@/lib/types';
import { ProductManager } from '@/components/non-covered/ProductManager';
import { PurchaseForm, type PurchaseFormValues } from '@/components/non-covered/PurchaseForm';
import { PurchaseTable } from '@/components/non-covered/PurchaseTable';
import { smallBtn } from '@/components/non-covered/shared';
import { useNonCoveredData } from '@/components/non-covered/useNonCoveredData';

const GENERAL = '일반';

// 구매 기록: 비급여 구매를 등록하고(해피콜이 자동으로 만들어진다) 목록에서 고치거나 지운다.
export default function NonCoveredRecordsPage() {
  const { supabase, purchases, products, setProducts, staffNames, doctorNames, rules, loading, error, setError, load } = useNonCoveredData();
  const [showForm, setShowForm] = useState(false);
  const [showProductManager, setShowProductManager] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState(ALL_CATEGORIES);
  // 구매일 기간으로 찾기(비우면 제한 없음)
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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
  const filtered = useMemo(() => filterPurchases(purchases, { category: activeTab, from, to }), [purchases, activeTab, from, to]);
  const summary = useMemo(() => summarizePurchases(filtered), [filtered]);

  function applyPreset(preset: PeriodPreset) {
    const range = periodRange(preset, todayKst());
    setFrom(range.from);
    setTo(range.to);
  }

  // 지금 보이는 목록(구분 탭 + 기간)을 엑셀 파일로 받는다. 해피콜 일정(1·2·3차)도 같이 들어간다.
  function downloadExcel() {
    const rows = purchaseExportRows(filtered, (createdBy) => (createdBy && staffNames[createdBy]) || '(삭제된 직원)', rules.special);
    const bytes = buildXlsx(activeTab === ALL_CATEGORIES ? '비급여 구매기록' : activeTab, EXPORT_HEADERS, rows);
    const blob = new Blob([bytes as BlobPart], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName(activeTab, from, to);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

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
          defaultCategory={activeTab !== ALL_CATEGORIES ? activeTab : GENERAL}
          knownPatients={knownPatients}
          doctorNames={doctorNames}
          submitting={submitting}
          rules={rules}
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[ALL_CATEGORIES, ...categories].map((tab) => (
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
            {tab !== ALL_CATEGORIES && countByCategory.has(tab) ? ` (${countByCategory.get(tab)})` : ''}
          </button>
        ))}
      </div>

      {/* 기간으로 찾기 + 엑셀 내려받기 — 위의 구분 탭(이벤트·일반 등)과 함께 걸린다. */}
      <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>기간</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="구매일 시작" className="input-field" style={{ width: 150 }} />
        <span className="muted-text">~</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="구매일 끝" className="input-field" style={{ width: 150 }} />
        {(['thisMonth', 'lastMonth', 'last3Months', 'thisYear', 'all'] as PeriodPreset[]).map((preset) => (
          <button key={preset} type="button" onClick={() => applyPreset(preset)} style={{ ...smallBtn, padding: '7px 12px', fontSize: 13, fontWeight: 600 }}>
            {PERIOD_PRESET_LABEL[preset]}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 14 }}>
          <b>{summary.count}건</b> · 합계 <b>{summary.total.toLocaleString('ko-KR')}원</b>
          {summary.missingAmount > 0 && <span className="muted-text"> (금액 미입력 {summary.missingAmount}건 제외)</span>}
        </span>
        <button type="button" onClick={downloadExcel} disabled={filtered.length === 0} className="btn-primary" style={{ padding: '9px 16px', fontSize: 14 }}>
          📥 엑셀 다운로드
        </button>
      </div>

      <PurchaseTable rows={filtered} products={products} categories={categories} staffNames={staffNames} doctorNames={doctorNames} rules={rules} onSave={handleSave} onDelete={handleDelete} />
    </div>
  );
}
