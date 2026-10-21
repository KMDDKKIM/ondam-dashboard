'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { medicineEndDate, OWNER_MESSAGE_LABEL, phaseLabel, TRACK_LABEL, type DietProgram, type DueMessage } from '@/lib/dietProgram';
import { fillScript, koDate, OWNER_SCRIPTS, scriptValues } from '@/lib/dietScripts';
import { diffDaysKst, todayKst } from '@/lib/kst';
import { createClient } from '@/lib/supabase/client';
import { loadOwnerDue, recordOwnerSend } from '@/lib/supabase/dietPrograms';
import { addCarePatient, deleteCarePatient, listCarePatients, loadCarePatientStatus, type CarePatientStatus } from '@/lib/supabase/herbCare';
import { confirmDialog } from '@/lib/confirmDialog';
import { herbCareStatus } from '@/lib/herbCare';
import { currentStaff } from '@/lib/supabase/herbQueue';

const th = { padding: '4px 8px', fontSize: 12, textAlign: 'left', color: 'var(--color-muted)', whiteSpace: 'nowrap' } as const;
const td = { padding: '5px 8px', fontSize: 13, whiteSpace: 'nowrap' } as const;

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

// 원장 전용 케어 보드 — 오늘 원장이 카톡을 보낼 환자, 린다이어트 진행 현황, 한약 복용중 환자를 한 화면에서 본다(원장 요청, 2026-10-20).
export function CareBoard() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayKst();
  const [programs, setPrograms] = useState<DietProgram[]>([]);
  const [due, setDue] = useState<DueMessage[]>([]);
  const [patients, setPatients] = useState<CarePatientStatus[]>([]);
  const [newName, setNewName] = useState('');
  const [newChart, setNewChart] = useState('');
  const [adding, setAdding] = useState(false);
  const [doctorName, setDoctorName] = useState('');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dietError, setDietError] = useState('');
  const [herbError, setHerbError] = useState('');

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
      setPatients(await loadCarePatientStatus(supabase, await listCarePatients(supabase), today));
      setHerbError('');
    } catch {
      setHerbError('등록한 환자를 불러오지 못했어요. (한약 패키지 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
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

  async function addPatient() {
    if (!newName.trim() || adding) return;
    setAdding(true);
    setHerbError('');
    try {
      await addCarePatient(supabase, { patientName: newName, chartNo: newChart });
      setNewName('');
      setNewChart('');
      setPatients(await loadCarePatientStatus(supabase, await listCarePatients(supabase), today));
    } catch {
      setHerbError('등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setAdding(false);
    }
  }

  async function removePatient(p: CarePatientStatus) {
    if (!(await confirmDialog(`${p.patientName}님을 케어 보드에서 뺄까요? (처방전·결제 기록은 그대로예요)`, { confirmLabel: '빼기' }))) return;
    try {
      await deleteCarePatient(supabase, p.id);
      setPatients((prev) => prev.filter((x) => x.id !== p.id));
    } catch {
      setHerbError('빼지 못했어요.');
    }
  }

  const byId = new Map(programs.map((p) => [p.id, p]));

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>케어 보드</h1>
      <p className="muted-text" style={{ margin: '0 0 14px', fontSize: 13 }}>원장님만 보이는 화면이에요. 린다이어트 환자의 이름·디톡스 시작일·주수는 <Link href="/diet-programs" style={{ textDecoration: 'underline' }}>린다이어트 환자</Link> 화면에서 데스크가 적어요. 기록이 끊긴 분이나 이상 증상은 <a href="https://chart.leandiet.co.kr/briefing" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>린다이어트 차트 브리핑</a>의 "연락 필요 환자"에서 확인하세요.</p>

      <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>📨 오늘 카톡 보낼 분 {due.length > 0 && <span style={{ color: 'var(--color-error)' }}>{due.length}건</span>}</h2>
      {loading && <p className="muted-text">불러오는 중…</p>}
      {dietError && <p className="error-text">{dietError}</p>}
      {!loading && !dietError && due.length === 0 && <p className="muted-text" style={{ marginBottom: 16 }}>오늘 보낼 카톡이 없어요 👍</p>}
      {due.map((item) => {
        const program = byId.get(item.programId);
        return program ? <DueCard key={`${item.programId}|${item.code}|${item.dueDate}`} program={program} item={item} doctorName={doctorName} onDone={onDone} /> : null;
      })}

      <h2 style={{ fontSize: 17, margin: '20px 0 8px' }}>🥗 린다이어트 진행 중 ({programs.length}명)</h2>
      {programs.length === 0 && !dietError && !loading && <p className="muted-text">진행 중인 환자가 없어요.</p>}
      {programs.length > 0 && (
        <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {['환자', '방식', '단계', '약 소진 예정', '마지막 원장 연락'].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => {
                const end = medicineEndDate(p);
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--color-line)' }}>
                    <td style={{ ...td, fontWeight: 700 }}>{p.patientName}</td>
                    <td style={td}>{TRACK_LABEL[p.track]}</td>
                    <td style={td}>{phaseLabel(p, today)}</td>
                    <td style={td}>{end ? `${koDate(end)} (D-${Math.max(0, diffDaysKst(today, end))})` : '-'}</td>
                    <td style={td}>{p.lastDoctorContactDate ? koDate(p.lastDoctorContactDate) : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 style={{ fontSize: 17, margin: '20px 0 8px' }}>🌿 한약 환자 ({patients.length}명)</h2>
      <p className="muted-text" style={{ margin: '0 0 8px', fontSize: 12 }}>
        챙기고 싶은 환자를 직접 등록하면 처방전·한약 패키지 기준으로 복용 현황과 패키지 잔여를 보여 드려요. 자동으로 올라가지는 않아요. 패키지를 결제한 환자 전체는 <Link href="/herb-packages" style={{ textDecoration: 'underline' }}>한약 패키지 현황</Link>에서 볼 수 있어요.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
        <label style={{ fontSize: 12 }}>
          환자명
          <input className="input-field" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addPatient()} style={{ display: 'block', width: 120, fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          차트번호(선택)
          <input className="input-field" value={newChart} onChange={(e) => setNewChart(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addPatient()} style={{ display: 'block', width: 110, fontSize: 13 }} />
        </label>
        <button type="button" className="btn-primary" disabled={!newName.trim() || adding} onClick={() => void addPatient()} style={{ fontSize: 13, padding: '6px 14px' }}>
          {adding ? '등록 중…' : '등록'}
        </button>
      </div>
      {herbError && <p className="error-text">{herbError}</p>}
      {patients.length > 0 && (
        <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {['환자', '최근 처방', '복용', '끝나는 날', '패키지 잔여', '다음 해피콜', ''].map((h, i) => (
                  <th key={`${h}-${i}`} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--color-line)' }}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {p.patientName}
                    {p.chartNo && <span className="muted-text" style={{ fontSize: 11, fontWeight: 400 }}> {p.chartNo}</span>}
                  </td>
                  <td style={td}>{p.herb ? p.herb.prescriptionName || '-' : '처방전 없음'}</td>
                  <td style={td}>
                    {p.herb ? herbCareStatus(p.herb) : '-'}
                    {p.herb?.pickupMissing && <span className="muted-text" style={{ fontSize: 11 }}> · 수령일 미입력(처방일 기준)</span>}
                  </td>
                  <td style={td}>{p.herb?.endDate ? koDate(p.herb.endDate) : '-'}</td>
                  <td style={{ ...td, color: p.balance && p.balance.remainingDays === 0 ? 'var(--color-error)' : undefined }}>
                    {p.balance ? `${p.balance.remainingDays}일 / ${p.balance.totalDays}일` : '-'}
                  </td>
                  <td style={td}>{p.nextCallDate ? koDate(p.nextCallDate) : '-'}</td>
                  <td style={td}>
                    <button type="button" onClick={() => removePatient(p)} style={{ fontSize: 11, padding: '2px 6px', color: '#b3261e' }}>
                      빼기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!herbError && !loading && patients.length === 0 && <p className="muted-text">아직 등록한 환자가 없어요.</p>}
    </div>
  );
}
