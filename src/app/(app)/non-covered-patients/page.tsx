'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listNonCoveredPurchases,
  createNonCoveredPurchase,
  listKnownPatients,
  defaultHappyCallDate,
  type KnownPatient,
} from '@/lib/supabase/nonCoveredPurchases';
import type { NonCoveredPurchase } from '@/lib/types';

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
  const [amount, setAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayString());
  const [happyCallDate, setHappyCallDate] = useState(defaultHappyCallDate(todayString()));
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState('전체');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  const supabase = createClient();

  async function load() {
    setLoading(true);
    setError('');
    try {
      const rows = await listNonCoveredPurchases(supabase);
      setPurchases(rows);
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
    setAmount('');
    setPurchaseDate(todayString());
    setHappyCallDate(defaultHappyCallDate(todayString()));
    setMemo('');
    setAddingCategory(false);
    setNewCategory('');
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
        createdBy: user?.id ?? null,
      });
      setShowForm(false);
      await load();
    } catch {
      setError('등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
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
        <button className="btn-primary" onClick={openForm}>
          + 등록
        </button>
      </div>

      {error && <p className="error-text" style={{ marginBottom: 16 }}>{error}</p>}

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

            <input
              placeholder="상품명"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="input-field"
              style={{ maxWidth: 200 }}
            />
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
                해피콜 예정일 (자동: +7일)
              </label>
              <input
                type="date"
                value={happyCallDate}
                onChange={(e) => setHappyCallDate(e.target.value)}
                className="input-field"
                style={{ maxWidth: 160 }}
              />
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
              {['환자명', '차트번호', '연락처', '구분', '상품명', '금액', '구매일', '해피콜', '메모'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 12px' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 16, textAlign: 'center' }} className="muted-text">
                  기록이 없어요.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--color-line)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{p.patientName}</td>
                  <td style={{ padding: '10px 12px' }}>{p.chartNo}</td>
                  <td style={{ padding: '10px 12px' }}>{p.phone ?? '-'}</td>
                  <td style={{ padding: '10px 12px' }}>{p.category}</td>
                  <td style={{ padding: '10px 12px' }}>{p.productName}</td>
                  <td style={{ padding: '10px 12px' }}>{formatAmount(p.amount)}</td>
                  <td style={{ padding: '10px 12px' }}>{p.purchaseDate}</td>
                  <td style={{ padding: '10px 12px' }}>{p.happyCallDate ?? '-'}</td>
                  <td style={{ padding: '10px 12px' }} className="muted-text">
                    {p.memo ?? ''}
                  </td>
                </tr>
              ))
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
