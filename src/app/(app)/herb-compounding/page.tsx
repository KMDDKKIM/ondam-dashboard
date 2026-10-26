'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import './herb-compounding.css';
import { OrderForm } from '@/components/herbCompounding/OrderForm';
import { FormulaPicker } from '@/components/herbCompounding/FormulaPicker';
import { PatientHistory } from '@/components/herbCompounding/PatientHistory';
import { PrintSheet } from '@/components/herbCompounding/PrintSheet';
import { herbPrintHref } from '@/lib/herb-print/handoff';
import { canSaveOrder, incompleteHerbLines, orderEdited, type HerbCompoundingOrder } from '@/lib/herbCompounding';
import { todayKst } from '@/lib/kst';
import { createClient } from '@/lib/supabase/client';
import {
  createHerbCompoundingOrder,
  getHerbCompoundingOrder,
  listKnownHerbCompoundingPatients,
  updateHerbCompoundingOrder,
  type KnownHerbPatient,
} from '@/lib/supabase/herbCompounding';
import { listHerbInventory } from '@/lib/supabase/herbInventory';
import { completeQueueForPrescription, currentStaff, undoHerbQueueDone } from '@/lib/supabase/herbQueue';
import { markOrderPrinted } from '@/lib/supabase/herbPickup';
import { loadPackageBalance } from '@/lib/supabase/herbPackages';
import { packageAfterPrintText, type PackageNote } from '@/lib/herbPackage';

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
  // 저장된(불러온) 처방전의 저장 당시 내용 — 지금 화면과 비교해 "수정한 내용이 아직 저장 안 됨"을 알린다.
  const [savedSnapshot, setSavedSnapshot] = useState<HerbCompoundingOrder | null>(null);
  const [herbNameOptions, setHerbNameOptions] = useState<string[]>([]);
  const [knownPatients, setKnownPatients] = useState<KnownHerbPatient[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  // "인쇄하기"를 누른 뒤 인쇄 창이 닫히면(afterprint) 처음 화면으로 돌아간다 — 인쇄했는지 헷갈리지 않게(원장 요청, 2026-10-06).
  const [pendingPrint, setPendingPrint] = useState(false);
  const printedByButton = useRef(false);
  const [printedNotice, setPrintedNotice] = useState(false);
  // 출력을 마친 환자의 한약 패키지 잔여 안내(패키지가 없는 환자는 null)
  const [packageNoticeAfter, setPackageNoticeAfter] = useState<PackageNote | null>(null);
  // 대기방의 "처방전 쓰기"로 들어온 경우 그 신청 번호 — 인쇄하면 그 신청을 완료로 바꾼다.
  const queueIdRef = useRef<string | null>(null);
  const printSnapshot = useRef<{ patientName: string; chartNo: string; dosesPerDay: number; orderId: string } | null>(null);
  // 방금 인쇄한 처방전의 환자·하루 복용횟수 — 인쇄 뒤 화면이 비워져도 "복용법 작성"으로 넘어갈 수 있게 남겨 둔다.
  const [lastPrinted, setLastPrinted] = useState<{ patientName: string; dosesPerDay: number } | null>(null);
  const [completedQueue, setCompletedQueue] = useState<{ id: string; name: string }[]>([]);
  const [queueUndone, setQueueUndone] = useState(false);
  // 좁은 화면에서는 처방집 칸을 접어 두고(위쪽 버튼으로 펼침), 넓은 화면에서는 항상 오른쪽에 펼쳐 둔다.
  const [sideOpen, setSideOpen] = useState(true);

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
    if (window.matchMedia('(max-width: 1100px)').matches) setSideOpen(false);
  }, []);

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
          if (record) {
            setOrder(record);
            setSavedSnapshot(record);
          }
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
  // 저장된 처방전을 고쳤는데 아직 수정하기를 누르지 않았는가
  const edited = Boolean(order.id && savedSnapshot && orderEdited(order, savedSnapshot));

  // asNew: 불러온 처방전의 내용(고친 것 포함)을 새 처방전으로 저장한다 — 처방일은 오늘로 바꾸고 원래 기록은 그대로 둔다("처방하기").
  async function handleSave(asNew = false): Promise<boolean> {
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
      const fields = {
        patientName: order.patientName,
        chartNo: order.chartNo,
        prescriptionName: order.prescriptionName,
        orderDate: asNew ? todayKst() : order.orderDate,
        packetCount: order.packetCount,
        packVolumeMl: order.packVolumeMl,
        daysSupply: order.daysSupply,
        dosesPerDay: order.dosesPerDay,
        packCount: order.packCount,
        totalLiquidMl: order.totalLiquidMl,
        herbs: order.herbs.filter((h) => h.herbName.trim() !== ''),
        memo: order.memo,
      };
      // 이미 저장된(불러온) 처방전이면 같은 기록을 고치고, 새 처방전이면 새로 저장한다 — 저장을 또 눌러 같은 처방전이 중복으로 쌓이지 않게.
      const updating = Boolean(order.id) && !asNew;
      const saved = updating
        ? await updateHerbCompoundingOrder(supabase, order.id, fields)
        : await createHerbCompoundingOrder(supabase, { ...fields, createdBy: user?.id ?? null });
      setOrder(saved);
      setSavedSnapshot(saved);
      setSavedMessage(asNew ? '새 처방전으로 저장되었어요(처방일 오늘).' : updating ? '수정되었습니다.' : '저장되었습니다.');
      setTimeout(() => setSavedMessage(''), 2000);
      refreshKnownPatients();
      return true;
    } catch {
      setErrorMessage(order.id && !asNew ? '수정에 실패했습니다. 다시 시도해 주세요.' : '저장에 실패했습니다. 다시 시도해 주세요.');
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
    // 새 처방전이거나, 불러온 처방전을 고친 채라면 먼저 저장한다(인쇄물과 기록이 어긋나지 않게).
    if ((!order.id || edited) && !(await handleSave())) return;
    // 저장 결과가 화면(인쇄용 시트)에 반영된 다음에 인쇄 창을 연다.
    setPendingPrint(true);
  }

  useEffect(() => {
    if (!pendingPrint) return;
    setPendingPrint(false);
    printedByButton.current = true;
    printSnapshot.current = { patientName: order.patientName, chartNo: order.chartNo, dosesPerDay: order.dosesPerDay, orderId: order.id };
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
      const snap = printSnapshot.current;
      // 출력을 마친 처방전은 한약 대기방에 "수령예정일 입력 대기"로 올린다(데스크가 수령예정일을 넣으면 해피콜이 만들어진다).
      if (snap?.orderId) {
        const supabase = createClient();
        // 출력 표시가 끝난 뒤에 잔여를 계산해야 이번 처방전이 차감된 값이 나온다.
        void markOrderPrinted(supabase, snap.orderId)
          .then(() => loadPackageBalance(supabase, { patientName: snap.patientName, chartNo: snap.chartNo }))
          .then((balance) => setPackageNoticeAfter(packageAfterPrintText(snap.patientName, balance)))
          .catch(() => setPackageNoticeAfter(null));
      }
      setPackageNoticeAfter(null);
      setLastPrinted(snap ? { patientName: snap.patientName, dosesPerDay: snap.dosesPerDay } : null);
      completeQueueAfterPrint();
      setOrder(makeEmptyOrder());
      setSavedSnapshot(null);
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
    setSavedSnapshot(null);
    setSavedMessage('');
    setErrorMessage('');
    setPrintedNotice(false);
    setLastPrinted(null);
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
      <div className="no-print herb-compounding-grid">
      <div className="card herb-compounding-main" style={{ padding: 20 }}>
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
          <button type="button" onClick={() => void handleSave()} disabled={saving} className="btn-primary">
            {order.id ? (saving ? '수정 중...' : '수정하기') : saving ? '저장 중...' : '저장하기'}
          </button>
          {order.id && (
            <button type="button" onClick={() => void handleSave(true)} disabled={saving} title="지금 화면의 내용을 새 처방전으로 저장합니다(처방일은 오늘로 바뀌고, 원래 기록은 그대로 남아요).">
              처방하기
            </button>
          )}
          <button type="button" onClick={handlePrint} disabled={!canSave || saving}>
            인쇄하기
          </button>
          {order.patientName.trim() && (
            <Link href={herbPrintHref(order.patientName, order.dosesPerDay)} className="muted-text" style={{ fontSize: 13, textDecoration: 'underline' }}>
              복용법 작성 →
            </Link>
          )}
          {savedMessage && <span style={{ color: 'var(--color-green)', fontSize: 13 }}>{savedMessage}</span>}
          {errorMessage && <span className="error-text">{errorMessage}</span>}
        </div>
        {printedNotice && (
          <p style={{ color: 'var(--color-green)', fontSize: 13, marginTop: 8, fontWeight: 600 }}>
            ✔ 인쇄했어요. 처음 화면으로 돌아왔고, 방금 처방전은 &quot;과거 기록 보기&quot;에 있어요.
            <span className="muted-text" style={{ fontWeight: 400 }}> 한약 대기방에 &quot;수령예정일 입력 대기&quot;로 올렸어요(데스크가 수령예정일을 넣으면 해피콜이 만들어져요).</span>
          </p>
        )}
        {printedNotice && packageNoticeAfter && (
          <p style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: packageNoticeAfter.level === 'warn' ? 'var(--color-error)' : 'var(--color-teal-deep)' }}>📦 {packageNoticeAfter.text}</p>
        )}
        {printedNotice && lastPrinted && lastPrinted.patientName.trim() && (
          <p style={{ marginTop: 8 }}>
            <Link href={herbPrintHref(lastPrinted.patientName, lastPrinted.dosesPerDay)} className="btn-primary" style={{ display: 'inline-block', padding: '8px 16px', fontSize: 14, textDecoration: 'none' }}>
              💊 {lastPrinted.patientName}님 복용법 작성하러 가기 →
            </Link>
            <span className="muted-text" style={{ fontSize: 12, marginLeft: 8 }}>환자 성함{lastPrinted.dosesPerDay === 2 || lastPrinted.dosesPerDay === 3 ? `·하루 ${lastPrinted.dosesPerDay}회` : ''}가 채워져요</span>
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
        {order.id && (
          <p className="muted-text" style={{ fontSize: 12, marginTop: 6 }}>
            저장된 처방전이에요. 약재를 고친 뒤 <strong>수정하기</strong>를 누르면 이 기록이 바뀌고, <strong>처방하기</strong>를 누르면 처방일이 오늘로 바뀐 새 처방전으로 저장돼요(원래 기록은 그대로).
            {edited && <span style={{ color: 'var(--color-error)', fontWeight: 700 }}> ⚠ 고친 내용이 아직 저장되지 않았어요.</span>}
          </p>
        )}
        {!order.id && <p className="muted-text" style={{ fontSize: 12, marginTop: 6 }}>저장하지 않고 &quot;인쇄하기&quot;를 눌러도 먼저 저장된 뒤 인쇄돼요. 인쇄 후에는 처음 화면으로 돌아와요.</p>}
      </div>

      {/* 처방집 — 넓은 화면에서는 오른쪽에 붙어 따라오고, 좁은 화면에서는 입력 위에서 접고 펼친다. */}
      <aside className="card herb-formula-side" data-open={sideOpen} style={{ padding: 16 }}>
        <button type="button" className="herb-formula-toggle" onClick={() => setSideOpen((v) => !v)} aria-expanded={sideOpen}>
          📖 처방집 검색 {sideOpen ? '▲' : '▼'}
        </button>
        <div className="herb-formula-title">📖 처방집</div>
        <div className="herb-formula-body">
          {/* 환자를 고르거나 이름을 적으면 같은 환자의 이전 처방이 처방집 검색 위에 뜬다. */}
          <PatientHistory value={order} onChange={setOrder} />
          <FormulaPicker value={order} onChange={setOrder} />
        </div>
      </aside>
      </div>

      <div className="print-only">
        <PrintSheet order={order} />
      </div>
    </div>
  );
}
