'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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
import { completeQueueForPrescription, currentStaff, undoHerbQueueDone } from '@/lib/supabase/herbQueue';

function makeEmptyOrder(): HerbCompoundingOrder {
  return {
    id: '',
    patientName: '',
    chartNo: '',
    prescriptionName: '',
    orderDate: todayKst(),
    packetCount: 0,
    packVolumeMl: 0,
    daysSupply: 0,
    dosesPerDay: 0,
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
  // "인쇄하기"를 누른 뒤 인쇄 창이 닫히면(afterprint) 처음 화면으로 돌아간다 — 인쇄했는지 헷갈리지 않게(원장 요청, 2026-10-06).
  const [pendingPrint, setPendingPrint] = useState(false);
  const printedByButton = useRef(false);
  const [printedNotice, setPrintedNotice] = useState(false);
  // 대기방의 "처방전 쓰기"로 들어온 경우 그 신청 번호 — 인쇄하면 그 신청을 완료로 바꾼다.
  const queueIdRef = useRef<string | null>(null);
  const printSnapshot = useRef<{ patientName: string; chartNo: string } | null>(null);
  const [completedQueue, setCompletedQueue] = useState<{ id: string; name: string }[]>([]);
  const [queueUndone, setQueueUndone] = useState(false);

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

  // ?load=<id> 로 들어오면(과거 기록에서 클릭) 그 처방전을 불러오고, ?patientName=...&chartNo=...
  // 로 들어오면(한약 대기방에서 "처방전 쓰기" 클릭) 새 처방전에 환자명·차트번호만 채워 둔다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loadId = params.get('load');
    const patientName = params.get('patientName');
    queueIdRef.current = params.get('queueId');
    if (!loadId && !patientName) return;
    window.history.replaceState(null, '', '/herb-compounding');
    if (loadId) {
      const supabase = createClient();
      getHerbCompoundingOrder(supabase, loadId)
        .then((record) => {
          if (record) setOrder(record);
        })
        .catch(() => setErrorMessage('기록을 불러오지 못했습니다.'));
      return;
    }
    setOrder((prev) => ({ ...prev, patientName: patientName ?? '', chartNo: params.get('chartNo') ?? '' }));
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

  async function handleSave(): Promise<boolean> {
    if (!canSave) {
      setErrorMessage('환자명·첩수·약재(약재명과 그램)를 채워주세요.');
      return false;
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
        prescriptionName: order.prescriptionName,
        orderDate: order.orderDate,
        packetCount: order.packetCount,
        packVolumeMl: order.packVolumeMl,
        daysSupply: order.daysSupply,
        dosesPerDay: order.dosesPerDay,
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
      return true;
    } catch {
      setErrorMessage('저장에 실패했습니다. 다시 시도해 주세요.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  // 저장하지 않은 처방전은 먼저 저장하고 인쇄한다 — 인쇄 뒤 화면이 비워지므로 내용이 사라지지 않게, 그리고
  // 인쇄한 처방전이 과거 기록에 남게. 저장에 실패하면 인쇄하지 않는다.
  async function handlePrint() {
    if (!canSave || saving) return;
    setPrintedNotice(false);
    if (!order.id && !(await handleSave())) return;
    // 저장 결과가 화면(인쇄용 시트)에 반영된 다음에 인쇄 창을 연다.
    setPendingPrint(true);
  }

  useEffect(() => {
    if (!pendingPrint) return;
    setPendingPrint(false);
    printedByButton.current = true;
    printSnapshot.current = { patientName: order.patientName, chartNo: order.chartNo };
    window.print();
  }, [pendingPrint]);

  // 인쇄한 처방전의 한약 대기방 신청을 완료로 바꾼다 — 대기 알림 숫자가 남지 않게. 인쇄 창을 취소해도 브라우저는
  // 인쇄한 것과 똑같이 알리므로, 바꾼 신청은 아래 안내의 "되돌리기"로 대기로 돌릴 수 있다.
  function completeQueueAfterPrint() {
    const snapshot = printSnapshot.current;
    const queueId = queueIdRef.current;
    printSnapshot.current = null;
    queueIdRef.current = null;
    setCompletedQueue([]);
    if (!snapshot) return;
    const supabase = createClient();
    currentStaff(supabase)
      .then((me) => completeQueueForPrescription(supabase, { queueId, ...snapshot }, me))
      .then((items) => setCompletedQueue(items.map((i) => ({ id: i.id, name: i.patientName }))))
      .catch(() => {
        // 대기방 정리가 안 돼도 인쇄 자체에는 영향이 없다 — 대기방에서 직접 완료하면 된다.
      });
  }

  async function undoQueueCompletion() {
    const supabase = createClient();
    try {
      for (const item of completedQueue) await undoHerbQueueDone(supabase, item.id);
      setQueueUndone(true);
    } catch {
      setErrorMessage('대기방 신청을 되돌리지 못했어요. 한약 대기방에서 직접 되돌려 주세요.');
    }
  }

  useEffect(() => {
    const onAfterPrint = () => {
      if (!printedByButton.current) return; // 버튼이 아니라 브라우저 메뉴·단축키로 인쇄한 경우는 그대로 둔다
      printedByButton.current = false;
      completeQueueAfterPrint();
      setOrder(makeEmptyOrder());
      setSavedMessage('');
      setErrorMessage('');
      setPrintedNotice(true);
      setQueueUndone(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  function handleNew() {
    setOrder(makeEmptyOrder());
    setSavedMessage('');
    setErrorMessage('');
    setPrintedNotice(false);
    queueIdRef.current = null;
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
          <button type="button" onClick={handlePrint} disabled={!canSave || saving}>
            인쇄하기
          </button>
          {savedMessage && <span style={{ color: 'var(--color-green)', fontSize: 13 }}>{savedMessage}</span>}
          {errorMessage && <span className="error-text">{errorMessage}</span>}
        </div>
        {printedNotice && (
          <p style={{ color: 'var(--color-green)', fontSize: 13, marginTop: 8, fontWeight: 600 }}>
            ✔ 인쇄했어요. 처음 화면으로 돌아왔고, 방금 처방전은 &quot;과거 기록 보기&quot;에 있어요.
          </p>
        )}
        {printedNotice && completedQueue.length > 0 && (
          <p style={{ fontSize: 13, marginTop: 4, color: queueUndone ? 'var(--color-muted)' : 'var(--color-green)' }}>
            {queueUndone ? '한약 대기방 신청을 대기로 되돌렸어요.' : `🫖 한약 대기방의 ${completedQueue.map((c) => c.name).join(', ')}님 신청을 완료로 바꿨어요.`}{' '}
            {!queueUndone && (
              <button type="button" onClick={undoQueueCompletion} style={{ border: 'none', background: 'none', textDecoration: 'underline', color: 'var(--color-muted)', fontSize: 12, padding: 0 }}>
                되돌리기
              </button>
            )}
          </p>
        )}
        {!order.id && <p className="muted-text" style={{ fontSize: 12, marginTop: 6 }}>저장하지 않고 &quot;인쇄하기&quot;를 눌러도 먼저 저장된 뒤 인쇄돼요. 인쇄 후에는 처음 화면으로 돌아와요.</p>}
      </div>

      <div className="print-only">
        <PrintSheet order={order} />
      </div>
    </div>
  );
}
