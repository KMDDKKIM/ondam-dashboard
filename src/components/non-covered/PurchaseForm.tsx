'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { DURATION_PRESETS, defaultHappyCallDate, suggestGoalCategory, type KnownPatient } from '@/lib/supabase/nonCoveredPurchases';
import { addDays, computeHerbCallDates } from '@/lib/happyCallStats';
import { todayKst } from '@/lib/kst';
import type { GoalCategory, NonCoveredProduct } from '@/lib/types';
import { Field, fieldGrid, inputBig } from './Field';
import { PatientSearch } from './PatientSearch';
import { GOAL_CATEGORY_LABEL } from './shared';

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

const sectionTitle = { fontSize: 14, fontWeight: 800, margin: '0 0 10px' } as const;

// 등록 폼: 환자 → 구매 내용 → 목표·한약 해피콜 → 메모를 한 화면에 모두 보여 준다("자세히"로 접지 않는다).
export function PurchaseForm({ products, categories, defaultCategory, knownPatients, submitting, onSubmit, onCancel }: Props) {
  const today = todayKst();
  const [name, setName] = useState('');
  const [chartNo, setChartNo] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [productChoice, setProductChoice] = useState('');
  const [productName, setProductName] = useState('');
  const [amount, setAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(today);
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
  }

  function handleProductChoice(value: string) {
    setProductChoice(value);
    const picked = value === CUSTOM_PRODUCT ? undefined : products.find((p) => p.id === value);
    setProductName(picked?.name ?? '');
    if (!goalCategoryTouched) setGoalCategory(picked ? suggestGoalCategory(picked.name) : null);
  }

  const missing = [!name.trim() && '환자 성함', !chartNo.trim() && '차트번호', !productName.trim() && '상품'].filter(Boolean) as string[];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (missing.length > 0) return;
    onSubmit({
      patientName: name.trim(),
      chartNo: chartNo.trim(),
      phone: null, // 비급여 현황에서는 연락처를 받지 않는다(해피콜 연락처는 차트번호로 찾는다)
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
    ? '해피콜 없음 (수령일이 비어 있어요)'
    : durationDays
      ? (() => {
          const { callDate1, callDate2, callDate3 } = computeHerbCallDates(happyCallDate, Number(durationDays));
          return `해피콜 3회: ${callDate1} · ${callDate2} · ${callDate3}`;
        })()
      : `해피콜 1회: ${addDays(happyCallDate, 1)} (수령일 다음날)`;

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 22, marginBottom: 24 }}>
      <h3 style={sectionTitle}>① 환자</h3>
      <PatientSearch knownPatients={knownPatients} onPick={pickPatient} />
      <div style={fieldGrid}>
        <Field label="환자 성함 *">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" style={inputBig} />
        </Field>
        <Field label="차트번호 *">
          <input value={chartNo} onChange={(e) => setChartNo(e.target.value)} className="input-field" style={inputBig} />
        </Field>
      </div>

      <h3 style={sectionTitle}>② 구매 내용</h3>
      <div style={fieldGrid}>
        <Field label="구분">
          {!addingCategory ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field" style={inputBig}>
                {(categories.includes(category) ? categories : [...categories, category]).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setAddingCategory(true);
                  setNewCategory('');
                }}
                style={{ padding: '0 12px', borderRadius: 10, border: '1px solid var(--color-line)', background: 'var(--color-surface-2)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                + 새 구분
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                placeholder="새 구분 이름 (예: 27설이벤트)"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="input-field"
                style={inputBig}
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  if (newCategory.trim()) setCategory(newCategory.trim());
                  setAddingCategory(false);
                }}
                style={{ padding: '0 12px', borderRadius: 10, border: '1px solid var(--color-line)', background: 'var(--color-surface-2)', fontSize: 13, fontWeight: 600 }}
              >
                확인
              </button>
            </div>
          )}
        </Field>
        <Field label="상품 *">
          <select value={productChoice} onChange={(e) => handleProductChoice(e.target.value)} className="input-field" style={inputBig}>
            <option value="">상품 선택</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={CUSTOM_PRODUCT}>＋ 직접 입력</option>
          </select>
        </Field>
        {productChoice === CUSTOM_PRODUCT && (
          <Field label="상품명 직접 입력">
            <input
              placeholder="다음부터 목록에서 고를 수 있어요"
              value={productName}
              onChange={(e) => {
                setProductName(e.target.value);
                if (!goalCategoryTouched) setGoalCategory(suggestGoalCategory(e.target.value));
              }}
              className="input-field"
              style={inputBig}
              autoFocus
            />
          </Field>
        )}
        <Field label="금액 (원)">
          <input type="number" placeholder="선택" value={amount} onChange={(e) => setAmount(e.target.value)} className="input-field" style={inputBig} />
        </Field>
        <Field label="구매일">
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => {
              setPurchaseDate(e.target.value);
              setHappyCallDate(defaultHappyCallDate(e.target.value));
            }}
            className="input-field"
            style={inputBig}
          />
        </Field>
      </div>

      <h3 style={sectionTitle}>③ 목표 · 한약 해피콜</h3>
      <div style={fieldGrid}>
        <Field label="목표 반영">
          <select
            value={goalCategory ?? ''}
            onChange={(e) => {
              setGoalCategory((e.target.value || null) as GoalCategory | null);
              setGoalCategoryTouched(true);
            }}
            className="input-field"
            style={inputBig}
          >
            <option value="">없음</option>
            {(Object.keys(GOAL_CATEGORY_LABEL) as GoalCategory[]).map((key) => (
              <option key={key} value={key}>
                {GOAL_CATEGORY_LABEL[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="한약 수령일 (해피콜 기준일, 기본: 구매일 다음날)">
          <input type="date" value={happyCallDate} onChange={(e) => setHappyCallDate(e.target.value)} className="input-field" style={inputBig} />
        </Field>
        <Field label="처방일수 (한약일 때만)">
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
            {DURATION_PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDurationDays(String(d))}
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--color-line)',
                  background: durationDays === String(d) ? 'var(--color-brand-b)' : 'var(--color-surface-2)',
                  color: durationDays === String(d) ? '#fff' : 'var(--color-ink)',
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                {d}일
              </button>
            ))}
            <input
              type="number"
              placeholder="직접"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              className="input-field"
              style={{ ...inputBig, width: 80 }}
            />
          </div>
        </Field>
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-teal-deep)', margin: '-4px 0 16px' }}>📞 {callHint}</p>

      <h3 style={sectionTitle}>④ 메모</h3>
      <div style={{ marginBottom: 18 }}>
        <input placeholder="메모 (선택)" value={memo} onChange={(e) => setMemo(e.target.value)} className="input-field" style={inputBig} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="submit" disabled={submitting || missing.length > 0} className="btn-primary" style={{ padding: '12px 28px', fontSize: 15 }}>
          {submitting ? '저장 중...' : '저장'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ padding: '12px 22px', borderRadius: 10, border: '1px solid var(--color-line)', background: 'var(--color-surface-2)', fontWeight: 600, fontSize: 15 }}
        >
          취소
        </button>
        {missing.length > 0 && <span className="muted-text" style={{ fontSize: 13 }}>{missing.join(', ')}을(를) 입력해 주세요</span>}
      </div>
    </form>
  );
}
