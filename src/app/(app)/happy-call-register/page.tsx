'use client';

import { confirmDialog } from '@/lib/confirmDialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listHappyCallPatients,
  listHappyCallPatientsByFirstVisitDate,
  createHappyCallPatient,
  updateHappyCallPatient,
  deleteHappyCallPatient,
  listAutoSkipKeys,
  addAutoSkipKey,
} from '@/lib/supabase/happyCallPatients';
import type { HappyCallPatient, Staff } from '@/lib/types';
import { HappyCallStatsPanel } from '@/components/happy-call/HappyCallStatsPanel';
import { FirstVisitCandidates, type CandidateRegistration } from '@/components/happy-call/FirstVisitCandidates';
import { SheetPasteImport } from '@/components/happy-call/SheetPasteImport';
import { VisitHistoryImport } from '@/components/happy-call/VisitHistoryImport';
import { FillContactsFromCandidates } from '@/components/happy-call/FillContactsFromCandidates';
import { DateCell } from '@/components/happy-call/DateCell';
import { compareByFirstVisitAsc } from '@/lib/dateDisplay';
import { doctorsAsStaffList, listDoctors, type Doctor } from '@/lib/supabase/doctors';
import { countUnreconciledRevisits, isUnreconciledRevisit, maturedCohortRange } from '@/lib/happyCallStats';
import { todayKst } from '@/lib/kst';
import { isPastHideWindow } from '@/lib/happyCallVisibility';
import { skipKey } from '@/lib/happyCallAutoRegister';
import { syncHappyCallFromReception } from '@/lib/supabase/happyCallAutoSync';
import { recordFirstVisitCallFromLog } from '@/lib/supabase/happyCallWorklist';

const PATIENT_TYPES: HappyCallPatient['patientType'][] = ['건보', '자보', '비급여'];
const VISIT_KINDS = ['초진', '재초진'] as const;
const PACKAGE_OPTIONS = ['성공', '실패', '비포함'] as const;

const cellStyle = { border: '1px solid #ddd', padding: '1px 3px', fontSize: 13 };
const selectStyle = { fontSize: 13, padding: 1, width: '100%' };
const textInputStyle = { fontSize: 13, padding: '2px 3px', width: '100%', border: 'none', background: 'transparent' };

// 맨 아래 등록 줄. 구분/진료의는 일부러 비워 둔다 — 기본값이 들어간 채 저장되는 일이 없도록
// 이름 + 진료의 + 구분을 모두 골라야만 등록된다.
function emptyDraft() {
  return {
    patientName: '',
    doctorStaffId: '',
    patientType: '' as HappyCallPatient['patientType'] | '',
    visitKind: '초진' as HappyCallPatient['visitKind'],
    phone: '',
    chartNo: '',
    firstVisitDate: todayKst(),
  };
}

export default function HappyCallRegisterPage() {
  const [patients, setPatients] = useState<HappyCallPatient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  const [candidateDate, setCandidateDate] = useState(todayKst());
  const [registeredOnDate, setRegisteredOnDate] = useState<HappyCallPatient[]>([]);
  const [onlyUnreconciled, setOnlyUnreconciled] = useState(false);
  // 초진 후 3주가 지난 환자는 기본으로 접어 두고, "펼쳐서 보기"로 다시 볼 수 있다.
  const [showOld, setShowOld] = useState(false);
  // 해피콜 표는 접수기록부의 초진·재초진으로 자동 등록되므로 수동 등록 도구(예약 후보 목록·직접 등록 줄)는 접어 둔다.
  const [showManual, setShowManual] = useState(false);
  const [autoFillNote, setAutoFillNote] = useState('');
  const automationStarted = useRef(false);

  // 통계에서 고른 주를 기준으로 이탈·삼진이 집계된 초진 주(예: 9/21 → 8/24~8/30)를 노랗게 표시한다.
  const highlightRange = highlightDate ? maturedCohortRange(highlightDate) : null;
  const today = todayKst();
  const unreconciledCount = useMemo(() => countUnreconciledRevisits(patients, today), [patients, today]);
  // 초진일 오래된 순(오름차순) — 새로 등록한 환자는 맨 아래 등록 줄 바로 위에 붙는다.
  const oldCount = useMemo(() => patients.filter((p) => isPastHideWindow(p.firstVisitDate, today)).length, [patients, today]);
  const visiblePatients = useMemo(() => {
    // "재내원 미입력만 보기"는 3주가 지난 환자가 대상이라 접힘과 상관없이 그대로 보여 준다.
    const base = onlyUnreconciled
      ? patients.filter((p) => isUnreconciledRevisit(p, today))
      : patients.filter((p) => showOld || !isPastHideWindow(p.firstVisitDate, today));
    return [...base].sort(compareByFirstVisitAsc);
  }, [patients, onlyUnreconciled, showOld, today]);
  const todayYear = Number(today.slice(0, 4));

  // 진료의 선택 칸·통계 필터·시트 붙여넣기는 (id, name) 목록을 받는다 — 활성 진료의를 그 모양으로 넘긴다.
  const staffList = useMemo(() => doctorsAsStaffList(doctors), [doctors]);
  const supabase = createClient();

  async function load(forDate = candidateDate) {
    setLoading(true);
    try {
      const [patientRows, doctorRows, registered] = await Promise.all([
        listHappyCallPatients(supabase),
        listDoctors(supabase),
        listHappyCallPatientsByFirstVisitDate(supabase, forDate),
      ]);
      setPatients(patientRows);
      setDoctors(doctorRows);
      // 접수기록부 자동 반영은 화면을 열 때 한 번만 돌린다(수정·삭제 뒤의 다시 불러오기에서는 돌리지 않는다).
      if (!automationStarted.current) {
        automationStarted.current = true;
        void runAutomation();
      }
      setRegisteredOnDate(registered);
    } catch {
      setError('불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  // 접수기록부에서 해피콜 표를 자동으로 맞춘다(lib/supabase/happyCallAutoSync.ts). 화면을 열 때 한 번 돌고, 바뀐 게 있으면 다시 읽는다.
  async function runAutomation() {
    const r = await syncHappyCallFromReception(supabase);
    const parts: string[] = [];
    if (r.created > 0) parts.push(`초진·재초진 ${r.created}명을 해피콜 표에 올렸어요(구분은 건보)`);
    if (r.revisitFilled > 0) parts.push(`2진·3진 ${r.revisitFilled}명분을 채웠어요`);
    if (r.contactFilled > 0) parts.push(`차트번호·연락처 ${r.contactFilled}명분을 채웠어요`);
    if (parts.length > 0) setAutoFillNote(`접수기록부에서 ${parts.join(', ')}.`);
    if (r.created + r.revisitFilled + r.contactFilled + r.birthFilled > 0) await load(candidateDate);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCandidateDateChange(date: string) {
    setCandidateDate(date);
    try {
      setRegisteredOnDate(await listHappyCallPatientsByFirstVisitDate(supabase, date));
    } catch {
      setError('불러오기에 실패했습니다.');
    }
  }

  // 후보 목록에서 한 번에 등록 — 예약 명단의 차트번호·연락처와 그 날짜(초진일)를 그대로 옮긴다.
  async function handleRegisterCandidate(reg: CandidateRegistration) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await createHappyCallPatient(supabase, {
      patientName: reg.candidate.patientName,
      doctorStaffId: reg.doctorStaffId,
      patientType: reg.patientType,
      firstVisitDate: candidateDate,
      createdBy: user?.id ?? null,
      visitKind: reg.visitKind,
      chartNo: reg.candidate.chartNo || null,
      phone: reg.candidate.phone || null,
    });
    if (isPastHideWindow(candidateDate, today)) setShowOld(true);
    await load(candidateDate);
  }

  const draftReady = Boolean(
    draft.patientName.trim() && draft.doctorStaffId && draft.patientType && draft.firstVisitDate
  );

  // 이름 + 진료의 + 구분이 다 정해졌을 때만 등록한다. 칸을 옮겨 다니는 것만으로는(blur)
  // 절대 저장되지 않는다 — Enter 나 "등록" 버튼으로만.
  async function commitDraft() {
    if (!draftReady || saving || draft.patientType === '') return;
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createHappyCallPatient(supabase, {
        patientName: draft.patientName.trim(),
        doctorStaffId: draft.doctorStaffId,
        patientType: draft.patientType,
        firstVisitDate: draft.firstVisitDate,
        createdBy: user?.id ?? null,
        visitKind: draft.visitKind,
        phone: draft.phone,
        chartNo: draft.chartNo,
      });
      if (isPastHideWindow(draft.firstVisitDate, today)) setShowOld(true);
      setDraft(emptyDraft());
      setError('');
      await load(candidateDate);
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  type TextField = 'revisit1' | 'revisit2' | 'jaboHerb1' | 'jaboHerb2' | 'jaboHerb3' | 'nextVisitNote' | 'callLog' | 'memo' | 'phone' | 'chartNo';

  async function handleFieldUpdate(id: string, field: TextField, value: string) {
    const next = value.trim() || null;
    const before = patients.find((p) => p.id === id);
    await updateHappyCallPatient(supabase, id, { [field]: next });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: next } : p)));
    // 통화내역 칸에 글을 적으면 해피콜 목록에도 통화 결과를 기록한다 — 목록에서 사라지지 않고 "오늘 완료한 콜"로
    // 넘어가고, "부재" 같은 글이면 내일 다시 걸 콜로 남는다. 부재 뒤에 덧붙여 적으면 다음 결과가 기록된다
    // (lib/happyCallQueue.ts classifyCallLog, supabase/happyCallWorklist.ts recordFirstVisitCallFromLog).
    if (field === 'callLog' && next && before) {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (await recordFirstVisitCallFromLog(supabase, before, next, user?.id ?? null, todayKst())) await load(candidateDate);
      } catch {
        // 해피콜 목록 기록이 안 돼도 표에 적은 글은 저장돼 있다 — 해피콜 목록에서 직접 기록하면 된다.
      }
    }
  }

  async function handleNameUpdate(id: string, value: string) {
    if (!value.trim()) return;
    await updateHappyCallPatient(supabase, id, { patientName: value.trim() });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, patientName: value.trim() } : p)));
  }

  async function handleDateUpdate(id: string, value: string) {
    if (!value) return;
    await updateHappyCallPatient(supabase, id, { firstVisitDate: value });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, firstVisitDate: value } : p)));
  }

  async function handleDoctorUpdate(id: string, value: string) {
    const doctorStaffId = value || null;
    await updateHappyCallPatient(supabase, id, { doctorStaffId });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, doctorStaffId } : p)));
  }

  async function handleTypeUpdate(id: string, value: HappyCallPatient['patientType']) {
    await updateHappyCallPatient(supabase, id, { patientType: value });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, patientType: value } : p)));
  }

  async function handleKindUpdate(id: string, value: '초진' | '재초진') {
    await updateHappyCallPatient(supabase, id, { visitKind: value });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, visitKind: value } : p)));
  }

  async function handleSuccessUpdate(id: string, value: '성공' | '실패' | '비포함' | '') {
    const acupunctureSuccess = value === '' ? null : value;
    await updateHappyCallPatient(supabase, id, { acupunctureSuccess });
    setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, acupunctureSuccess } : p)));
  }

  async function handleDelete(p: HappyCallPatient) {
    if (!await confirmDialog(`${p.patientName} (${p.firstVisitDate}) 등록을 삭제할까요? 되돌릴 수 없어요.`)) return;
    try {
      await deleteHappyCallPatient(supabase, p.id);
      // 지운 사람은 자동 등록이 다시 올리지 않게 기억해 둔다(실패해도 삭제는 그대로).
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        await addAutoSkipKey(supabase, skipKey(p.firstVisitDate, p.patientName), user?.id ?? null);
      } catch {
        // 마이그레이션 전이면 기억하지 못한다.
      }
      setError('');
      await load(candidateDate);
    } catch {
      setError('삭제하지 못했어요. 이미 지워졌거나 권한이 없을 수 있어요.');
    }
  }

  if (loading && patients.length === 0) return <p>불러오는 중...</p>;

  const draftHint = draftReady ? 'Enter 또는 등록 버튼으로 저장돼요' : '이름 + 진료의 + 구분을 고르면 등록할 수 있어요';

  return (
    <div>
      <h1 style={{ marginBottom: 16 }}>초진환자 해피콜</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* 이 페이지는 AppMain의 WIDE_PATHS에 들어 있어 1100px 폭 제한 없이 화면 가로
          전체를 쓴다 — 표 칸이 많아서(성함~메모) 최대한 스크롤 없이 보이게 하려는 것. */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            aria-expanded={showManual}
            style={{ fontSize: 13, padding: '5px 12px', fontWeight: 600 }}
          >
            ✍️ 수동 등록 (예약 명단 후보 · 직접 등록 줄) {showManual ? '▲' : '▼'}
          </button>
          <span className="muted-text" style={{ fontSize: 12, marginLeft: 8 }}>
            접수기록부에 초진·재초진으로 적으면 이 표에 자동으로 올라와요. 자동으로 안 올라온 분만 여기서 직접 올려 주세요.
          </span>
        </div>

        {showManual && (
          <FirstVisitCandidates
            date={candidateDate}
            onDateChange={handleCandidateDateChange}
            staffList={staffList}
            registered={registeredOnDate}
            onRegister={handleRegisterCandidate}
          />
        )}

        <VisitHistoryImport onDone={() => load(candidateDate)} />

        <FillContactsFromCandidates patients={patients} onDone={() => load(candidateDate)} />

        <SheetPasteImport patients={patients} staffList={staffList} onDone={() => load(candidateDate)} />

        <HappyCallStatsPanel patients={patients} staffList={staffList} onDateClick={setHighlightDate} />

        {unreconciledCount > 0 && (
          <div
            style={{
              marginTop: 20,
              padding: '8px 12px',
              borderRadius: 8,
              background: '#fff3cd',
              color: '#7a5b00',
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            재내원 미입력 {unreconciledCount}명
            <span style={{ fontWeight: 400, fontSize: 12 }}>
              초진 후 3주가 지났는데 재내원 날짜가 하나도 없어요. 실제로 왔다면 입력해 주세요(안 적힌 채로는 이탈로 계산돼요).
            </span>
            <button type="button" onClick={() => setOnlyUnreconciled((v) => !v)} style={{ fontSize: 12, padding: '2px 8px' }}>
              {onlyUnreconciled ? '전체 보기' : '이 환자만 보기'}
            </button>
          </div>
        )}

        {highlightRange && (
          <p style={{ marginTop: 16, fontSize: 12, color: '#7a5b00' }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, background: '#fff3cd', border: '1px solid #e6d28a', verticalAlign: '-2px', marginRight: 6 }} />
            노란 줄 = 위에서 고른 주 기준으로 이탈·삼진이 집계되는 초진 {highlightRange.start.slice(5).replace('-', '/')} ~ {highlightRange.end.slice(5).replace('-', '/')}
            {!showOld && !onlyUnreconciled && oldCount > 0 && ' (3주 지나 접힌 환자는 아래 "펼쳐서 보기"를 눌러야 보여요)'}
          </p>
        )}
        {autoFillNote && (
          <p style={{ marginTop: 16, marginBottom: 0, fontSize: 13, color: 'var(--color-teal-deep)' }}>{autoFillNote}</p>
        )}
        {oldCount > 0 && !onlyUnreconciled && (
          <p style={{ marginTop: 16, marginBottom: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="muted-text">
              {showOld ? `초진 후 3주가 지난 환자 ${oldCount}명도 함께 보고 있어요.` : `초진 후 3주가 지난 환자 ${oldCount}명은 접어 두었어요.`}
            </span>
            <button type="button" onClick={() => setShowOld((v) => !v)} style={{ fontSize: 12, padding: '2px 10px' }}>
              {showOld ? '다시 접기' : '펼쳐서 보기'}
            </button>
          </p>
        )}
        <div style={{ overflowX: 'auto', marginTop: 20 }}>
      <table className="hc-table" style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 13, minWidth: 1464, width: '100%', margin: '0 auto' }}>
        <colgroup>
          <col style={{ width: 80 }} />
          <col style={{ width: 70 }} />
          <col style={{ width: 108 }} />
          <col style={{ width: 66 }} />
          <col style={{ width: 60 }} />
          <col style={{ width: 76 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 200 }} />
          <col style={{ width: 200 }} />
          <col style={{ width: 70 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 88 }} />
          <col style={{ width: 44 }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#f0f0f0' }}>
            {['성함', '차트번호', '연락처', '진료의', '구분', '초진/재초진', '약침/패키지구분', '다음내원메모', '통화내역', '1진 초진일', '2진', '3진', '1차약', '2차약', '3차약', '메모', ''].map((h, i) => (
              <th key={`${h}-${i}`} style={{ ...cellStyle, textAlign: 'left', fontSize: 12, lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiblePatients.map((p) => (
            <tr
              key={p.id}
              style={
                highlightRange && p.firstVisitDate >= highlightRange.start && p.firstVisitDate <= highlightRange.end
                  ? { background: '#fff3cd' }
                  : undefined
              }
            >
              <td style={cellStyle}>
                <input defaultValue={p.patientName} onBlur={(e) => handleNameUpdate(p.id, e.target.value)} style={textInputStyle} />
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.chartNo ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'chartNo', e.target.value)} style={textInputStyle} />
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.phone ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'phone', e.target.value)} style={textInputStyle} />
              </td>
              <td style={cellStyle}>
                <select value={p.doctorStaffId ?? ''} onChange={(e) => handleDoctorUpdate(p.id, e.target.value)} style={selectStyle}>
                  <option value=""></option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </td>
              <td style={cellStyle}>
                <select
                  value={p.patientType}
                  onChange={(e) => handleTypeUpdate(p.id, e.target.value as HappyCallPatient['patientType'])}
                  style={selectStyle}
                >
                  {PATIENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              <td style={cellStyle}>
                <select value={p.visitKind ?? '초진'} onChange={(e) => handleKindUpdate(p.id, e.target.value as '초진' | '재초진')} style={selectStyle}>
                  {VISIT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </td>
              <td style={cellStyle}>
                <select value={p.acupunctureSuccess ?? ''} onChange={(e) => handleSuccessUpdate(p.id, e.target.value as '성공' | '실패' | '비포함' | '')} style={selectStyle}>
                  <option value=""></option>
                  {PACKAGE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.nextVisitNote ?? ''} title={p.nextVisitNote ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'nextVisitNote', e.target.value)} style={textInputStyle} />
              </td>
              <td style={cellStyle}>
                <input defaultValue={p.callLog ?? ''} title={p.callLog ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'callLog', e.target.value)} style={textInputStyle} />
              </td>
              <td style={cellStyle}>
                <DateCell value={p.firstVisitDate} todayYear={todayYear} onCommit={(v) => handleDateUpdate(p.id, v)} />
              </td>
              {(['revisit1', 'revisit2', 'jaboHerb1', 'jaboHerb2', 'jaboHerb3'] as const).map((field) => (
                <td key={field} style={cellStyle}>
                  <DateCell value={p[field] ?? null} todayYear={todayYear} onCommit={(v) => handleFieldUpdate(p.id, field, v)} />
                </td>
              ))}
              <td style={cellStyle}>
                <input defaultValue={p.memo ?? ''} title={p.memo ?? ''} onBlur={(e) => handleFieldUpdate(p.id, 'memo', e.target.value)} style={textInputStyle} />
              </td>
              <td style={cellStyle}>
                <button type="button" onClick={() => handleDelete(p)} style={{ fontSize: 12, padding: '1px 5px', color: '#b3261e', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                  삭제
                </button>
              </td>
            </tr>
          ))}

          {/* 등록 줄 — 이름 + 진료의 + 구분을 모두 고르고 Enter 또는 "등록"을 눌러야 저장된다(칸을 옮기는 것만으로는 저장되지 않음). */}
          {showManual && (
          <tr style={{ background: '#fafdf9' }}>
            <td style={cellStyle}>
              <input
                value={draft.patientName}
                onChange={(e) => setDraft((d) => ({ ...d, patientName: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDraft();
                }}
                placeholder="+ 환자 이름"
                style={textInputStyle}
              />
            </td>
            <td style={cellStyle}>
              <input
                value={draft.chartNo}
                onChange={(e) => setDraft((d) => ({ ...d, chartNo: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDraft();
                }}
                placeholder="차트번호"
                style={textInputStyle}
              />
            </td>
            <td style={cellStyle}>
              <input
                value={draft.phone}
                onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitDraft();
                }}
                placeholder="연락처"
                style={textInputStyle}
              />
            </td>
            <td style={cellStyle}>
              <select
                value={draft.doctorStaffId}
                onChange={(e) => setDraft((d) => ({ ...d, doctorStaffId: e.target.value }))}
                style={selectStyle}
              >
                <option value="">진료의</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </td>
            <td style={cellStyle}>
              <select
                value={draft.patientType}
                onChange={(e) => setDraft((d) => ({ ...d, patientType: e.target.value as HappyCallPatient['patientType'] | '' }))}
                style={selectStyle}
              >
                <option value="">구분</option>
                {PATIENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </td>
            <td style={cellStyle}>
              <select
                value={draft.visitKind ?? '초진'}
                onChange={(e) => setDraft((d) => ({ ...d, visitKind: e.target.value as '초진' | '재초진' }))}
                style={selectStyle}
              >
                {VISIT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </td>
            <td style={cellStyle} colSpan={3} className="muted-text">
              <button
                type="button"
                onClick={commitDraft}
                disabled={!draftReady || saving}
                style={{ fontSize: 13, padding: '3px 12px', fontWeight: 700, marginRight: 8 }}
              >
                등록
              </button>
              {draftHint}
            </td>
            <td style={cellStyle}>
              <DateCell value={draft.firstVisitDate} todayYear={todayYear} onCommit={(v) => setDraft((d) => ({ ...d, firstVisitDate: v || todayKst() }))} />
            </td>
            <td style={cellStyle} colSpan={7}></td>
          </tr>
          )}
        </tbody>
      </table>
        </div>
      </div>
    </div>
  );
}
