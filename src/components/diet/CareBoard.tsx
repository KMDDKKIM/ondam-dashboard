'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { OWNER_MESSAGE_LABEL, phaseLabel, TRACK_LABEL, type DietProgram, type DueMessage } from '@/lib/dietProgram';
import { fillScript, koDate, OWNER_SCRIPTS, scriptValues } from '@/lib/dietScripts';
import { addDaysKst, diffDaysKst, todayKst } from '@/lib/kst';
import { createClient } from '@/lib/supabase/client';
import { loadOwnerDue, recordOwnerSend } from '@/lib/supabase/dietPrograms';
import { listCareDue, updateCarePatient, type CarePatient } from '@/lib/supabase/herbCare';
import { currentStaff } from '@/lib/supabase/herbQueue';
import { CarePatients } from './CarePatients';


function DueCard({ program, item, doctorName, onDone }: { program: DietProgram; item: DueMessage; doctorName: string; onDone: (item: DueMessage, action: 'sent' | 'skipped') => Promise<void> }) {
  const initial = useMemo(() => fillScript(OWNER_SCRIPTS[item.code], scriptValues(program, item.code, doctorName, item.dueDate)), [program, item, doctorName]);
  const [text, setText] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const unresolved = text.match(/\{[^{}]+\}/g) ?? [];

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 복사를 못 하면 글을 직접 선택해 복사하면 된다.
    }
  }

  async function finish(action: 'sent' | 'skipped') {
    setBusy(true);
    try {
      await onDone(item, action);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>{program.patientName}</span>
        <span style={{ fontWeight: 700, color: 'var(--color-teal-deep)' }}>{OWNER_MESSAGE_LABEL[item.code]}</span>
        <span className="muted-text" style={{ fontSize: 12 }}>
          {TRACK_LABEL[program.track]} · {phaseLabel(program, todayKst())}
          {program.phone ? ` · ${program.phone}` : ''}
        </span>
        {item.overdueDays > 0 && <span style={{ fontSize: 12, color: 'var(--color-error)', fontWeight: 700 }}>{item.overdueDays}일 지남</span>}
      </div>
      <textarea className="input-field" value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(10, Math.max(3, text.split('\n').length + 1))} style={{ width: '100%', fontSize: 13 }} />
      {unresolved.length > 0 && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-error)' }}>직접 채울 곳이 있어요: {[...new Set(unresolved)].join(' ')}</p>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="button" onClick={copy} style={{ fontSize: 13, padding: '4px 12px' }}>
          {copied ? '✓ 복사했어요' : '문구 복사'}
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => finish('sent')} style={{ fontSize: 13, padding: '4px 12px' }}>
          카톡 보냄
        </button>
        <button type="button" disabled={busy} onClick={() => finish('skipped')} style={{ fontSize: 13, padding: '4px 12px' }}>
          건너뜀
        </button>
      </div>
    </div>
  );
}

// 다음 해피콜 날짜가 된 한약 환자 — 메모(중점 사항·지난 상담 내용)를 보며 전화하고, 마치면 "해피콜 완료"를 누른다.
function CareCallCard({ patient, today, onDone }: { patient: CarePatient; today: string; onDone: (p: CarePatient, action: 'done' | 'tomorrow') => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const overdue = patient.nextCallDate ? diffDaysKst(patient.nextCallDate, today) : 0;

  async function finish(action: 'done' | 'tomorrow') {
    setBusy(true);
    try {
      await onDone(patient, action);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10, borderLeft: '4px solid var(--color-teal)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>{patient.patientName}</span>
        <span style={{ fontWeight: 700, color: 'var(--color-teal-deep)' }}>{patient.kind === 'diet' ? '🥗 린다이어트 해피콜' : patient.kind === 'special' ? '💎 특수한약 해피콜' : '🌿 한약 해피콜'}</span>
        {patient.chartNo && <span className="muted-text" style={{ fontSize: 12 }}>차트 {patient.chartNo}</span>}
        {overdue > 0 && <span style={{ fontSize: 12, color: 'var(--color-error)', fontWeight: 700 }}>{overdue}일 지남</span>}
        {patient.lastCallDate && <span className="muted-text" style={{ fontSize: 12 }}>마지막 해피콜 {koDate(patient.lastCallDate)}</span>}
      </div>
      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, background: 'var(--color-surface-2)', borderRadius: 8, padding: '8px 10px' }}>
        {patient.memo || <span className="muted-text">메모가 없어요. 아래 환자 카드에서 중점 사항을 적어 두세요.</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => finish('done')} style={{ fontSize: 13, padding: '4px 12px' }}>
          해피콜 완료
        </button>
        <button type="button" disabled={busy} onClick={() => finish('tomorrow')} style={{ fontSize: 13, padding: '4px 12px' }}>
          내일로 미루기
        </button>
      </div>
    </div>
  );
}

// 원장 전용 케어 보드 — 오늘 원장이 카톡을 보낼 환자, 린다이어트 진행 현황, 한약 복용중 환자를 한 화면에서 본다(원장 요청, 2026-10-20).
export function CareBoard() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayKst();
  const [programs, setPrograms] = useState<DietProgram[]>([]);
  const [due, setDue] = useState<DueMessage[]>([]);
  const [careDue, setCareDue] = useState<CarePatient[]>([]);
  // 한약 환자 카드가 다시 읽을 때 올리는 번호
  const [careVersion, setCareVersion] = useState(0);
  const [doctorName, setDoctorName] = useState('');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dietError, setDietError] = useState('');

  const load = useCallback(async () => {
    const me = await currentStaff(supabase);
    setDoctorName(me.name);
    setStaffId(me.id);
    try {
      const r = await loadOwnerDue(supabase, today);
      setPrograms(r.programs);
      setDue(r.due);
      setDietError('');
    } catch {
      setDietError('린다이어트 프로그램을 불러오지 못했어요. (프로그램 카드 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    }
    try {
      setCareDue(await listCareDue(supabase, today));
    } catch {
      setCareDue([]); // 해피콜 날짜 칸을 만드는 SQL 전이면 한약 환자 해피콜만 안 보인다
    }
    setLoading(false);
  }, [supabase, today]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDone(item: DueMessage, action: 'sent' | 'skipped') {
    await recordOwnerSend(supabase, { programId: item.programId, code: item.code, dueDate: item.dueDate }, action, staffId, today);
    setDue((prev) => prev.filter((d) => !(d.programId === item.programId && d.code === item.code && d.dueDate === item.dueDate)));
    if (action === 'sent') setPrograms((prev) => prev.map((p) => (p.id === item.programId ? { ...p, lastDoctorContactDate: today } : p)));
  }

  async function onCareDone(p: CarePatient, action: 'done' | 'tomorrow') {
    if (action === 'done') await updateCarePatient(supabase, p.id, { lastCallDate: today, nextCallDate: '' });
    else await updateCarePatient(supabase, p.id, { nextCallDate: addDaysKst(today, 1) });
    setCareDue((prev) => prev.filter((x) => x.id !== p.id));
    setCareVersion((v) => v + 1);
  }

  const byId = new Map(programs.map((p) => [p.id, p]));
  const dueTotal = due.length + careDue.length;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>케어 보드</h1>
      <p className="muted-text" style={{ margin: '0 0 14px', fontSize: 13 }}>원장님만 보이는 화면이에요. <Link href="/non-covered-patients" style={{ textDecoration: 'underline' }}>비급여 현황</Link>에서 한약·공진단·경옥고·린다이어트를 결제하면 환자가 자동으로 올라와요(린다이어트는 디톡스 시작일·주수를 적으면 디톡스 3일은 데스크 해피콜, 다이어트환 시작일은 여기서 원장님이 연락). 기록이 끊긴 분이나 이상 증상은 <a href="https://chart.leandiet.co.kr/briefing" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>린다이어트 차트 브리핑</a>의 "연락 필요 환자"에서 확인하세요.</p>

      <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>📨 오늘 연락할 분 {dueTotal > 0 && <span style={{ color: 'var(--color-error)' }}>{dueTotal}건</span>}</h2>
      {loading && <p className="muted-text">불러오는 중…</p>}
      {dietError && <p className="error-text">{dietError}</p>}
      {!loading && !dietError && dueTotal === 0 && <p className="muted-text" style={{ marginBottom: 16 }}>오늘 연락할 분이 없어요 👍</p>}
      {careDue.map((p) => (
        <CareCallCard key={p.id} patient={p} today={today} onDone={onCareDone} />
      ))}
      {due.map((item) => {
        const program = byId.get(item.programId);
        return program ? <DueCard key={`${item.programId}|${item.code}|${item.dueDate}`} program={program} item={item} doctorName={doctorName} onDone={onDone} /> : null;
      })}

      <CarePatients reloadKey={careVersion} onCallsChanged={() => void load()} />
    </div>
  );
}
