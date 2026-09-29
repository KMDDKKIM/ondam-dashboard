'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import './herb-compounding.css';
import { OrderForm } from '@/components/herbCompounding/OrderForm';
import { PrintSheet } from '@/components/herbCompounding/PrintSheet';
import { canSaveOrder, incompleteHerbLines, type HerbCompoundingOrder } from '@/lib/herbCompounding';
import { todayKst } from '@/lib/kst';
import { createClient } from '@/lib/supabase/client';
import {
  createHerbCompoundingOrder,
  getHerbCompoundingOrder,
  listKnownHerbCompoundingPatients,
  type KnownHerbPatient,
} from '@/lib/supabase/herbCompounding';
import { listHerbInventory } from '@/lib/supabase/herbInventory';

function makeEmptyOrder(): HerbCompoundingOrder {
  return {
    id: '',
    patientName: '',
    chartNo: '',
    orderDate: todayKst(),
    packetCount: 0,
    packVolumeMl: 0,
    daysSupply: 0,
    packCount: 0,
    totalLiquidMl: 0,
    herbs: [{ herbName: '', prepMethod: '', gramsPerPacket: 0 }],
    memo: '',
    createdAt: '',
    updatedAt: '',
  };
}

export default function HerbCompoundingPage() {
  const [order, setOrder] = useState<HerbCompoundingOrder>(() => makeEmptyOrder());
  const [herbNameOptions, setHerbNameOptions] = useState<string[]>([]);
  const [knownPatients, setKnownPatients] = useState<KnownHerbPatient[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // 환자명 검색 후보 — 전에 저장한 처방전들에서 이름+차트번호 조합을 뽑는다.
  function refreshKnownPatients() {
    const supabase = createClient();
    listKnownHerbCompoundingPatients(supabase)
      .then(setKnownPatients)
      .catch(() => {
        // 못 불러와도 직접 입력하면 된다.
      });
  }
  useEffect(() => {
    refreshKnownPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?load=<id> 로 들어오면(과거 기록에서 클릭) 그 처방전을 불러온다 — 한약 복용법 출력과 같은 관례.
  useEffect(() => {
    const loadId = new URLSearchParams(window.location.search).get('load');
    if (!loadId) return;
    window.history.replaceState(null, '', '/herb-compounding');
    const supabase = createClient();
    getHerbCompoundingOrder(supabase, loadId)
      .then((record) => {
        if (record) setOrder(record);
      })
      .catch(() => setErrorMessage('기록을 불러오지 못했습니다.'));
  }, []);

  // 약재명 자동완성 후보 — 한약재 재고 현황의 약재 목록을 그대로 쓴다.
  useEffect(() => {
    const supabase = createClient();
    listHerbInventory(supabase)
      .then((items) => setHerbNameOptions(items.map((i) => i.name)))
      .catch(() => {
        // 못 불러와도 직접 입력하면 된다.
      });
  }, []);

  const incompleteLines = incompleteHerbLines(order.herbs);
  const canSave = canSaveOrder(order) && incompleteLines.length === 0;

  async function handleSave() {
    if (!canSave) {
      setErrorMessage('환자명·첩수·약재(약재명과 그램)를 채워주세요.');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const saved = await createHerbCompoundingOrder(supabase, {
        patientName: order.patientName,
        chartNo: order.chartNo,
        orderDate: order.orderDate,
        packetCount: order.packetCount,
        packVolumeMl: order.packVolumeMl,
        daysSupply: order.daysSupply,
        packCount: order.packCount,
        totalLiquidMl: order.totalLiquidMl,
        herbs: order.herbs.filter((h) => h.herbName.trim() !== ''),
        memo: order.memo,
        createdBy: user?.id ?? null,
      });
      setOrder(saved);
      setSavedMessage('저장되었습니다.');
      setTimeout(() => setSavedMessage(''), 2000);
      refreshKnownPatients();
    } catch {
      setErrorMessage('저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleNew() {
    setOrder(makeEmptyOrder());
    setSavedMessage('');
    setErrorMessage('');
  }

  return (
    <div className="herb-compounding-app">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>한약 처방전</h2>
        <Link href="/herb-compounding/records" className="muted-text">
          과거 기록 보기
        </Link>
      </div>

      {/* 화면에서는 입력 칸만 보여준다 — 옆에 미리보기까지 같이 두면 같은 내용이 두 번
          찍혀서 겹쳐 보였다(원장 지적, 2026-09-29). 실제 찍히는 모양은 "인쇄하기"를 눌러
          window.print()가 열릴 때(.print-only)만 보면 된다. */}
      <div className="no-print card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700 }}>처방 입력</span>
          <button type="button" onClick={handleNew} className="muted-text" style={{ background: 'none', border: 'none', textDecoration: 'underline', padding: 0 }}>
            새 처방전 시작
          </button>
        </div>
        <OrderForm
          value={order}
          onChange={setOrder}
          herbNameOptions={herbNameOptions}
          knownPatients={knownPatients}
          incompleteLines={incompleteLines}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? '저장 중...' : '저장하기'}
          </button>
          <button type="button" onClick={handlePrint} disabled={!canSave}>
            인쇄하기
          </button>
          {savedMessage && <span style={{ color: 'var(--color-green)', fontSize: 13 }}>{savedMessage}</span>}
          {errorMessage && <span className="error-text">{errorMessage}</span>}
        </div>
        {!order.id && <p className="muted-text" style={{ fontSize: 12, marginTop: 6 }}>저장하지 않고 인쇄하면 과거 기록에는 안 남아요.</p>}
      </div>

      <div className="print-only">
        <PrintSheet order={order} />
      </div>
    </div>
  );
}
