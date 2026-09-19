'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listNonCoveredPurchases,
  createNonCoveredPurchase,
  updateNonCoveredPurchase,
  deleteNonCoveredPurchase,
  listKnownPatients,
  defaultHappyCallDate,
  suggestGoalCategory,
  DURATION_PRESETS,
  type KnownPatient,
} from '@/lib/supabase/nonCoveredPurchases';
import {
  listNonCoveredProducts,
  addNonCoveredProduct,
  renameNonCoveredProduct,
  deleteNonCoveredProduct,
} from '@/lib/supabase/nonCoveredProducts';
import { addDays, computeHerbCallDates } from '@/lib/happyCallStats';
import type { GoalCategory, NonCoveredProduct, NonCoveredPurchase } from '@/lib/types';

const GOAL_CATEGORY_LABEL: Record<GoalCategory, string> = {
  herb: '한약',
  diet: '다이어트',
  special_herb: '특수한약',
  chuna: '추나',
};

const CUSTOM_PRODUCT = '__custom__';

const linkBtn = {
  border: 'none',
  background: 'transparent',
  color: 'var(--color-muted)',
  fontSize: 12,
  fontWeight: 600,
  padding: 0,
} as const;

const smallBtn = {
  padding: '4px 10px',
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid var(--color-line)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-ink)',
} as const;

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatAmount(n: number | null): string {
  return n != null ? `${n.toLocaleString()}원` : '-';
}

export default function NonCoveredPatientsPage() {
  const [purchases, setPurchases] = useState<NonCoveredPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [chartNo, setChartNo] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('일반');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [productName, setProductName] = useState('');
  const [productChoice, setProductChoice] = useState('');
  const [products, setProducts] = useState<NonCoveredProduct[]>([]);
  const [showProductManager, setShowProductManager] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [amount, setAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayString());
  const [happyCallDate, setHappyCallDate] = useState(defaultHappyCallDate(todayString()));
  const [durationDays, setDurationDays] = useState('');
  const [goalCategory, setGoalCategory] = useState<GoalCategory | null>(null);
  const [goalCategoryTouched, setGoalCategoryTouched] = useState(false);
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    patientName: string;
    chartNo: string;
    phone: string;
    category: string;
    productName: string;
    amount: string;
    purchaseDate: string;
    goalCategory: GoalCategory | null;
    memo: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState('전체');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  const supabase = createClient();

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [rows, productRows] = await Promise.all([
        listNonCoveredPurchases(supabase),
        listNonCoveredProducts(supabase).catch(() => [] as NonCoveredProduct[]),
      ]);
      setPurchases(rows);
      setProducts(productRows);
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
    const set = new Set<string>(['일반']);
    purchases.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [purchases]);
  const eventCategories = useMemo(() => categories.filter((c) => c !== '일반'), [categories]);

  const searchMatches: KnownPatient[] = useMemo(() => {
    const q = search.trim();
    if (!q) return [];
    return knownPatients
      .filter((p) => p.patientName.includes(q) || p.chartNo.includes(q) || (p.phone ?? '').includes(q))
      .slice(0, 8);
  }, [search, knownPatients]);

  function pickPatient(p: KnownPatient) {
    setName(p.patientName);
    setChartNo(p.chartNo);
    setPhone(p.phone ?? '');
    setSearch('');
  }

  function openForm() {
    setShowForm(true);
    setSearch('');
    setName('');
    setChartNo('');
    setPhone('');
    setCategory(activeTab !== '전체' ? activeTab : '일반');
    setProductName('');
    setProductChoice('');
    setAmount('');
    setPurchaseDate(todayString());
    setHappyCallDate(defaultHappyCallDate(todayString()));
    setDurationDays('');
    setGoalCategory(null);
    setGoalCategoryTouched(false);
    setMemo('');
    setAddingCategory(false);
    setNewCategory('');
  }

  function handleProductChoice(value: string) {
    setProductChoice(value);
    if (value === CUSTOM_PRODUCT || value === '') {
      setProductName('');
      if (!goalCategoryTouched) setGoalCategory(null);
      return;
    }
    const picked = products.find((p) => p.id === value);
    if (!picked) return;
    setProductName(picked.name);
    if (!goalCategoryTouched) setGoalCategory(suggestGoalCategory(picked.name));
  }

  async function handleAddProduct() {
    const value = newProductName.trim();
    if (!value) return;
    if (products.some((p) => p.name === value)) {
      setError('이미 있는 상품명이에요.');
      return;
    }
    try {
      setError('');
      await addNonCoveredProduct(supabase, value, products);
      setNewProductName('');
      setProducts(await listNonCoveredProducts(supabase));
    } catch {
      setError('상품을 추가하지 못했습니다.');
    }
  }

  async function handleRenameProduct(id: string) {
    const value = renameText.trim();
    if (!value) return;
    if (products.some((p) => p.id !== id && p.name === value)) {
      setError('이미 있는 상품명이에요.');
      return;
    }
    try {
      setError('');
      await renameNonCoveredProduct(supabase, id, value);
      setRenamingId(null);
      setProducts(await listNonCoveredProducts(supabase));
    } catch {
      setError('상품 이름을 수정하지 못했습니다.');
    }
  }

  async function handleDeleteProduct(p: NonCoveredProduct) {
    if (!window.confirm(`"${p.name}"을(를) 상품 목록에서 삭제할까요? (이미 등록된 기록은 그대로 남아요)`)) return;
    try {
      setError('');
      await deleteNonCoveredProduct(supabase, p.id);
      if (productChoice === p.id) handleProductChoice('');
      setProducts(await listNonCoveredProducts(supabase));
    } catch {
      setError('상품을 삭제하지 못했습니다.');
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !chartNo.trim() || !productName.trim()) return;
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createNonCoveredPurchase(supabase, {
        patientName: name.trim(),
        chartNo: chartNo.trim(),
        phone: phone.trim() || null,
        category: category.trim() || '일반',
        productName: productName.trim(),
        amount: amount ? Number(amount) : null,
        purchaseDate,
        memo: memo.trim() || null,
        happyCallDate: happyCallDate || null,
        durationDays: durationDays ? Number(durationDays) : null,
        goalCategory,
        createdBy: user?.id ?? null,
      });
      // 직접 입력한 상품명은 다음부터 목록에서 고를 수 있게 저장한다(실패해도 등록은 유지).
      const typedName = productName.trim();
      if (productChoice === CUSTOM_PRODUCT && !products.some((p) => p.name === typedName)) {
        await addNonCoveredProduct(supabase, typedName, products).catch(() => {});
      }
      setShowForm(false);
      await load();
    } catch {
      setError('등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(p: NonCoveredPurchase) {
    setEditingId(p.id);
    setEditDraft({
      patientName: p.patientName,
      chartNo: p.chartNo,
      phone: p.phone ?? '',
      category: p.category,
      productName: p.productName,
      amount: p.amount != null ? String(p.amount) : '',
      purchaseDate: p.purchaseDate,
      goalCategory: p.goalCategory,
      memo: p.memo ?? '',
    });
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;
    try {
      await updateNonCoveredPurchase(supabase, editingId, {
        patientName: editDraft.patientName.trim(),
        chartNo: editDraft.chartNo.trim(),
        phone: editDraft.phone.trim() || null,
        category: editDraft.category.trim() || '일반',
        productName: editDraft.productName.trim(),
        amount: editDraft.amount ? Number(editDraft.amount) : null,
        purchaseDate: editDraft.purchaseDate,
        memo: editDraft.memo.trim() || null,
        goalCategory: editDraft.goalCategory,
      });
      setEditingId(null);
      setEditDraft(null);
      await load();
    } catch {
      setError('수정에 실패했습니다.');
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('이 기록을 삭제할까요?')) return;
    try {
      await deleteNonCoveredPurchase(supabase, id);
      await load();
    } catch {
      setError('삭제에 실패했습니다.');
    }
  }

  const filtered = activeTab === '전체' ? purchases : purchases.filter((p) => p.category === activeTab);

  // 상품명별 · 카테고리별 건수/금액 집계 — "이번 이벤트 실적"과 "지난 이벤트 비교"에 같이 쓴다.
  const summaryByCategory = useMemo(() => {
    const map = new Map<string, { count: number; amount: number; products: Map<string, { count: number; amount: number }> }>();
    for (const p of purchases) {
      if (!map.has(p.category)) map.set(p.category, { count: 0, amount: 0, products: new Map() });
      const cat = map.get(p.category)!;
      cat.count += 1;
      cat.amount += p.amount ?? 0;
      if (!cat.products.has(p.productName)) cat.products.set(p.productName, { count: 0, amount: 0 });
      const prod = cat.products.get(p.productName)!;
      prod.count += 1;
      prod.amount += p.amount ?? 0;
    }
    return map;
  }, [purchases]);

  const compareProducts = useMemo(() => {
    if (!compareA && !compareB) return [];
    const names = new Set<string>();
    summaryByCategory.get(compareA)?.products.forEach((_, name) => names.add(name));
    summaryByCategory.get(compareB)?.products.forEach((_, name) => names.add(name));
    return Array.from(names).sort();
  }, [compareA, compareB, summaryByCategory]);

  useEffect(() => {
    if (eventCategories.length >= 2 && !compareA && !compareB) {
      setCompareA(eventCategories[eventCategories.length - 2]);
      setCompareB(eventCategories[eventCategories.length - 1]);
    } else if (eventCategories.length === 1 && !compareA) {
      setCompareA(eventCategories[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventCategories]);

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
          style={{
            ...smallBtn,
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 600,
            marginRight: 8,
          }}
        >
          상품 목록 관리
        </button>
        <button className="btn-primary" onClick={openForm}>
          + 등록
        </button>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

      <datalist id="non-covered-product-options">
        {products.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>

      {showProductManager && (
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
                      if (e.key === 'Enter') handleRenameProduct(p.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="input-field"
                    style={{ width: 150, padding: '4px 8px' }}
                    autoFocus
                  />
                  <button type="button" onClick={() => handleRenameProduct(p.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: 12 }}>
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
                  <button type="button" onClick={() => handleDeleteProduct(p)} style={{ ...linkBtn, color: 'var(--color-error)' }}>
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
                if (e.key === 'Enter') handleAddProduct();
              }}
              className="input-field"
              style={{ maxWidth: 220 }}
            />
            <button type="button" onClick={handleAddProduct} className="btn-primary" style={{ padding: '8px 16px' }}>
              추가
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input
              placeholder="환자 검색 (이름/차트번호/연락처) — 있으면 눌러서 자동 입력"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field"
            />
            {searchMatches.length > 0 && (
              <div
                className="card"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 5,
                  marginTop: 4,
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                {searchMatches.map((p) => (
                  <button
                    key={p.chartNo}
                    type="button"
                    onClick={() => pickPatient(p)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-ink)',
                      fontWeight: 400,
                      borderBottom: '1px solid var(--color-line)',
                    }}
                  >
                    <strong>{p.patientName}</strong>{' '}
                    <span className="muted-text">
                      {p.chartNo}
                      {p.phone ? ` · ${p.phone}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <input
              placeholder="환자 성함"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              style={{ maxWidth: 140 }}
            />
            <input
              placeholder="차트번호"
              value={chartNo}
              onChange={(e) => setChartNo(e.target.value)}
              className="input-field"
              style={{ maxWidth: 120 }}
            />
            <input
              placeholder="연락처"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-field"
              style={{ maxWidth: 150 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
            {!addingCategory ? (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input-field"
                style={{ maxWidth: 160 }}
              >
                {(categories.includes(category) ? categories : [...categories, category]).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder="새 구분 이름 (예: 27설이벤트)"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="input-field"
                style={{ maxWidth: 180 }}
              />
            )}
            <button
              type="button"
              onClick={() => {
                if (addingCategory) {
                  if (newCategory.trim()) setCategory(newCategory.trim());
                  setAddingCategory(false);
                } else {
                  setAddingCategory(true);
                  setNewCategory('');
                }
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid var(--color-line)',
                background: 'var(--color-surface-2)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {addingCategory ? '확인' : '+ 새 구분'}
            </button>

            <select
              value={productChoice}
              onChange={(e) => handleProductChoice(e.target.value)}
              className="input-field"
              style={{ maxWidth: 200 }}
            >
              <option value="">상품 선택</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value={CUSTOM_PRODUCT}>＋ 직접 입력</option>
            </select>
            {productChoice === CUSTOM_PRODUCT && (
              <input
                placeholder="상품명 직접 입력 (다음부터 목록에서 고를 수 있어요)"
                value={productName}
                onChange={(e) => {
                  const value = e.target.value;
                  setProductName(value);
                  if (!goalCategoryTouched) setGoalCategory(suggestGoalCategory(value));
                }}
                className="input-field"
                style={{ maxWidth: 260 }}
                autoFocus
              />
            )}
            <input
              type="number"
              placeholder="금액 (선택)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-field"
              style={{ maxWidth: 130 }}
            />
            <div>
              <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
                목표 반영
              </label>
              <select
                value={goalCategory ?? ''}
                onChange={(e) => {
                  setGoalCategory((e.target.value || null) as GoalCategory | null);
                  setGoalCategoryTouched(true);
                }}
                className="input-field"
                style={{ maxWidth: 130 }}
              >
                <option value="">없음</option>
                {(Object.keys(GOAL_CATEGORY_LABEL) as GoalCategory[]).map((key) => (
                  <option key={key} value={key}>
                    {GOAL_CATEGORY_LABEL[key]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
                구매일
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => {
                  setPurchaseDate(e.target.value);
                  setHappyCallDate(defaultHappyCallDate(e.target.value));
                }}
                className="input-field"
                style={{ maxWidth: 160 }}
              />
            </div>
            <div>
              <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
                한약 수령일 (해피콜 기준일, 기본: 구매일 다음날)
              </label>
              <input
                type="date"
                value={happyCallDate}
                onChange={(e) => setHappyCallDate(e.target.value)}
                className="input-field"
                style={{ maxWidth: 160 }}
              />
            </div>
            <div>
              <label className="muted-text" style={{ display: 'block', marginBottom: 4 }}>
                처방일수 (한약일 때만)
              </label>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDurationDays(String(d))}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--color-line)',
                      background: durationDays === String(d) ? 'var(--color-brand-b)' : 'var(--color-surface-2)',
                      color: durationDays === String(d) ? '#fff' : 'var(--color-ink)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {d}일
                  </button>
                ))}
                <input
                  type="number"
                  placeholder="직접입력"
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  className="input-field"
                  style={{ maxWidth: 90 }}
                />
              </div>
              {happyCallDate && (
                <p className="muted-text" style={{ fontSize: 11, marginTop: 4 }}>
                  {(() => {
                    if (!durationDays) return `1차 해피콜: ${addDays(happyCallDate, 1)} (수령일 다음날)`;
                    const { callDate1, callDate2, callDate3 } = computeHerbCallDates(happyCallDate, Number(durationDays));
                    return `해피콜: ${callDate1} · ${callDate2} · ${callDate3}`;
                  })()}
                </p>
              )}
            </div>
          </div>

          <input
            placeholder="메모 (선택)"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="input-field"
            style={{ marginBottom: 10 }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={submitting} className="btn-primary">
              저장
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '1px solid var(--color-line)',
                background: 'var(--color-surface-2)',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              취소
            </button>
          </div>
        </form>
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
            {tab !== '전체' && summaryByCategory.has(tab) ? ` (${summaryByCategory.get(tab)!.count})` : ''}
          </button>
        ))}
      </div>

      <div className="card" style={{ overflowX: 'auto', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--color-surface-2)' }}>
              {['환자명', '차트번호', '연락처', '구분', '상품명', '금액', '구매일', '한약수령일/해피콜', '목표', '메모', ''].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 12px' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: 16, textAlign: 'center' }} className="muted-text">
                  기록이 없어요.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                if (editingId === p.id && editDraft) {
                  return (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--color-line)', background: 'var(--color-surface-2)' }}>
                      <td style={{ padding: 6 }}>
                        <input value={editDraft.patientName} onChange={(e) => setEditDraft({ ...editDraft, patientName: e.target.value })} className="input-field" style={{ minWidth: 90 }} />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input value={editDraft.chartNo} onChange={(e) => setEditDraft({ ...editDraft, chartNo: e.target.value })} className="input-field" style={{ minWidth: 90 }} />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input value={editDraft.phone} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} className="input-field" style={{ minWidth: 110 }} />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })} className="input-field" style={{ minWidth: 90 }} />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input value={editDraft.productName} onChange={(e) => setEditDraft({ ...editDraft, productName: e.target.value })} className="input-field" style={{ minWidth: 110 }} list="non-covered-product-options" />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input type="number" value={editDraft.amount} onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })} className="input-field" style={{ minWidth: 90 }} />
                      </td>
                      <td style={{ padding: 6 }}>
                        <input type="date" value={editDraft.purchaseDate} onChange={(e) => setEditDraft({ ...editDraft, purchaseDate: e.target.value })} className="input-field" style={{ minWidth: 140 }} />
                      </td>
                      <td style={{ padding: 6 }} className="muted-text">
                        (해피콜 일정은 편집 불가)
                      </td>
                      <td style={{ padding: 6 }}>
                        <select
                          value={editDraft.goalCategory ?? ''}
                          onChange={(e) => setEditDraft({ ...editDraft, goalCategory: (e.target.value || null) as GoalCategory | null })}
                          className="input-field"
                        >
                          <option value="">없음</option>
                          {(Object.keys(GOAL_CATEGORY_LABEL) as GoalCategory[]).map((key) => (
                            <option key={key} value={key}>
                              {GOAL_CATEGORY_LABEL[key]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: 6 }}>
                        <input value={editDraft.memo} onChange={(e) => setEditDraft({ ...editDraft, memo: e.target.value })} className="input-field" style={{ minWidth: 110 }} />
                      </td>
                      <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                        <button onClick={saveEdit} className="btn-primary" style={{ padding: '4px 10px', fontSize: 12, marginRight: 4 }}>
                          저장
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditDraft(null);
                          }}
                          style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--color-line)', background: 'var(--color-surface)', borderRadius: 8 }}
                        >
                          취소
                        </button>
                      </td>
                    </tr>
                  );
                }

                const callDates =
                  p.happyCallDate && p.durationDays
                    ? computeHerbCallDates(p.happyCallDate, p.durationDays)
                    : null;

                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--color-line)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.patientName}</td>
                    <td style={{ padding: '10px 12px' }}>{p.chartNo}</td>
                    <td style={{ padding: '10px 12px' }}>{p.phone ?? '-'}</td>
                    <td style={{ padding: '10px 12px' }}>{p.category}</td>
                    <td style={{ padding: '10px 12px' }}>{p.productName}</td>
                    <td style={{ padding: '10px 12px' }}>{formatAmount(p.amount)}</td>
                    <td style={{ padding: '10px 12px' }}>{p.purchaseDate}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12 }}>
                      {callDates ? (
                        <span className="muted-text">
                          {p.happyCallDate} (처방{p.durationDays}일)
                          <br />
                          1차 {callDates.callDate1} · 2차 {callDates.callDate2} · 3차 {callDates.callDate3}
                        </span>
                      ) : (
                        p.happyCallDate ?? '-'
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }} className="muted-text">
                      {p.goalCategory ? GOAL_CATEGORY_LABEL[p.goalCategory] : '-'}
                    </td>
                    <td style={{ padding: '10px 12px' }} className="muted-text">
                      {p.memo ?? ''}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => startEdit(p)} style={{ border: 'none', background: 'transparent', color: 'var(--color-brand-b)', fontSize: 12, fontWeight: 600, marginRight: 6 }}>
                        수정
                      </button>
                      <button onClick={() => handleDelete(p.id)} style={{ border: 'none', background: 'transparent', color: 'var(--color-error)', fontSize: 12, fontWeight: 600 }}>
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {eventCategories.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>📊 이벤트 실적 비교</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={compareA} onChange={(e) => setCompareA(e.target.value)} className="input-field" style={{ maxWidth: 180 }}>
              <option value="">선택 안 함</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="muted-text">vs</span>
            <select value={compareB} onChange={(e) => setCompareB(e.target.value)} className="input-field" style={{ maxWidth: 180 }}>
              <option value="">선택 안 함</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {(compareA || compareB) && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-2)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px' }}>상품명</th>
                    {compareA && (
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>{compareA} 건수/금액</th>
                    )}
                    {compareB && (
                      <th style={{ textAlign: 'right', padding: '8px 10px' }}>{compareB} 건수/금액</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {compareProducts.map((product) => {
                    const a = summaryByCategory.get(compareA)?.products.get(product);
                    const b = summaryByCategory.get(compareB)?.products.get(product);
                    return (
                      <tr key={product} style={{ borderTop: '1px solid var(--color-line)' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{product}</td>
                        {compareA && (
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {a ? `${a.count}건 / ${formatAmount(a.amount)}` : '-'}
                          </td>
                        )}
                        {compareB && (
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {b ? `${b.count}건 / ${formatAmount(b.amount)}` : '-'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid var(--color-line)', fontWeight: 700 }}>
                    <td style={{ padding: '8px 10px' }}>합계</td>
                    {compareA && (
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {summaryByCategory.get(compareA)
                          ? `${summaryByCategory.get(compareA)!.count}건 / ${formatAmount(summaryByCategory.get(compareA)!.amount)}`
                          : '-'}
                      </td>
                    )}
                    {compareB && (
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        {summaryByCategory.get(compareB)
                          ? `${summaryByCategory.get(compareB)!.count}건 / ${formatAmount(summaryByCategory.get(compareB)!.amount)}`
                          : '-'}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
