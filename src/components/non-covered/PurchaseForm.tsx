'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { defaultHappyCallDate, suggestGoalCategory, type KnownPatient } from '@/lib/supabase/nonCoveredPurchases';
import { addDays, computeHerbCallDates } from '@/lib/happyCallStats';
import { todayKst } from '@/lib/kst';
import type { GoalCategory, NonCoveredProduct } from '@/lib/types';
import { PatientSearch } from './PatientSearch';
import { PurchaseFormDetails } from './PurchaseFormDetails';

const CUSTOM_PRODUCT = '__custom__';

export interface PurchaseFormValues {
  patientName: string;
  chartNo: string;
  phone: string | null;
  category: string;
  productName: string;
  amount: number | null;
  purchaseDate: string;
  memo: string | null;
  happyCallDate: string | null;
  durationDays: number | null;
  goalCategory: GoalCategory | null;
  /** 상품 목록에 없는 이름을 직접 입력했는지(다음부터 목록에 저장하기 위함) */
  isCustomProduct: boolean;
}

interface Props {
  products: NonCoveredProduct[];
  categories: string[];
  defaultCategory: string;
  knownPatients: KnownPatient[];
  submitting: boolean;
  onSubmit: (values: PurchaseFormValues) => void;
  onCancel: () => void;
}

const labelStyle = { display: 'block', marginBottom: 4 } as const;

// 기본으로는 환자명/차트번호/연락처/구분/상품/금액/구매일만 보이고,
// 목표 반영·수령일·처방일수·메모는 "자세히"에 접어 둔다.
export function PurchaseForm({ products, categories, defaultCategory, knownPatients, submitting, onSubmit, onCancel }: Props) {
  const today = todayKst();
  const [name, setName] = useState('');
  const [chartNo, setChartNo] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [productChoice, setProductChoice] = useState('');
  const [productName, setProductName] = useState('');
  const [amount, setAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [showDetails, setShowDetails] = useState(false);
  const [happyCallDate, setHappyCallDate] = useState(defaultHappyCallDate(today));
  const [durationDays, setDurationDays] = useState('');
  const [goalCategory, setGoalCategory] = useState<GoalCategory | null>(null);
  const [goalCategoryTouched, setGoalCategoryTouched] = useState(false);
  const [memo, setMemo] = useState('');

  // 상품 목록 관리에서 지금 고른 상품을 지웠으면 선택을 비운다.
  useEffect(() => {
    if (productChoice && productChoice !== CUSTOM_PRODUCT && !products.some((p) => p.id === productChoice)) {
      setProductChoice('');
      setProductName('');
    }
  }, [products, productChoice]);

  function pickPatient(p: KnownPatient) {
    setName(p.patientName);
    setChartNo(p.chartNo);
    setPhone(p.phone ?? '');
  }

  function handleProductChoice(value: string) {
    setProductChoice(value);
    const picked = value === CUSTOM_PRODUCT ? undefined : products.find((p) => p.id === value);
    setProductName(picked?.name ?? '');
    if (!goalCategoryTouched) setGoalCategory(picked ? suggestGoalCategory(picked.name) : null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !chartNo.trim() || !productName.trim()) return;
    onSubmit({
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
      isCustomProduct: productChoice === CUSTOM_PRODUCT,
    });
  }

  const callHint = !happyCallDate
    ? '해피콜 없음'
    : durationDays
      ? (() => {
          const { callDate1, callDate2, callDate3 } = computeHerbCallDates(happyCallDate, Number(durationDays));
          return `해피콜: ${callDate1} · ${callDate2} · ${callDate3}`;
        })()
      : `1차 해피콜: ${addDays(happyCallDate, 1)} (수령일 다음날)`;

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 20, marginBottom: 20 }}>
      <PatientSearch knownPatients={knownPatients} onPick={pickPatient} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input placeholder="환자 성함" value={name} onChange={(e) => setName(e.target.value)} className="input-field" style={{ maxWidth: 140 }} />
        <input placeholder="차트번호" value={chartNo} onChange={(e) => setChartNo(e.target.value)} className="input-field" style={{ maxWidth: 120 }} />
        <input placeholder="연락처" value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" style={{ maxWidth: 150 }} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'flex-end' }}>
        {!addingCategory ? (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field" style={{ maxWidth: 160 }}>
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

        <select value={productChoice} onChange={(e) => handleProductChoice(e.target.value)} className="input-field" style={{ maxWidth: 200 }}>
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
              setProductName(e.target.value);
              if (!goalCategoryTouched) setGoalCategory(suggestGoalCategory(e.target.value));
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
          <label className="muted-text" style={labelStyle}>
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
      </div>

      <p className="muted-text" style={{ fontSize: 12, marginBottom: 10 }}>
        {callHint}
      </p>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        style={{ border: 'none', background: 'transparent', color: 'var(--color-brand-b)', fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 10 }}
      >
        {showDetails ? '자세히 접기 ▲' : '자세히 ▼'}
      </button>

      {showDetails && (
        <PurchaseFormDetails
          goalCategory={goalCategory}
          onGoalCategoryChange={(value) => {
            setGoalCategory(value);
            setGoalCategoryTouched(true);
          }}
          happyCallDate={happyCallDate}
          onHappyCallDateChange={setHappyCallDate}
          durationDays={durationDays}
          onDurationDaysChange={setDurationDays}
          memo={memo}
          onMemoChange={setMemo}
        />
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={submitting} className="btn-primary">
          저장
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--color-line)', background: 'var(--color-surface-2)', fontWeight: 600, fontSize: 14 }}
        >
          취소
        </button>
      </div>
    </form>
  );
}
