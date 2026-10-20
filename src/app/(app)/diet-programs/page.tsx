'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDialog } from '@/lib/confirmDialog';
import { dietPillStartDate, medicineEndDate, phaseLabel, TRACK_LABEL, type DietProgram, type DietTrack } from '@/lib/dietProgram';
import { koDate } from '@/lib/dietScripts';
import { todayKst } from '@/lib/kst';
import { createClient } from '@/lib/supabase/client';
import { createDietProgram, deleteDietProgram, listDietPrograms, markDietStep, updateDietProgram, type ProgramPatch } from '@/lib/supabase/dietPrograms';
import { currentStaff } from '@/lib/supabase/herbQueue';

const labelStyle = { display: 'block', fontSize: 12 } as const;
const cell = { padding: '6px 8px', fontSize: 13, verticalAlign: 'top' } as const;

// 린다이어트 환자(데스크·원장 공용) — 이름·방식·디톡스 시작일·주수만 적으면 해피콜이 날짜에 맞춰 자동으로 만들어진다.
// 결제 확인·발송 완료·종료 단추를 누르면 그에 맞는 안내 해피콜이 오늘 날짜로 해피콜 목록에 올라간다
// (원장 요청, 2026-10-20. 환자의 1차 관리는 린다이어트 차트에서 하고 여기는 최소 입력만 한다).
export default function DietProgramsPage() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayKst();
  const [programs, setPrograms] = useState<DietProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showEnded, setShowEnded] = useState(false);
  const [staffId, setStaffId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [track, setTrack] = useState<DietTrack>('visit');
  const [detoxStart, setDetoxStart] = useState('');
  const [weeks, setWeeks] = useState('12');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPrograms(await listDietPrograms(supabase));
      setError('');
    } catch {
      setError('린다이어트 환자를 불러오지 못했어요. (프로그램 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
    currentStaff(supabase).then((me) => setStaffId(me.id), () => {});
  }, [load, supabase]);

  async function add() {
    if (!name.trim() || adding) return;
    setAdding(true);
    setError('');
    try {
      await createDietProgram(supabase, { patientName: name, phone, track, firstDate: today, detoxStartDate: detoxStart, weeks: weeks ? Number(weeks) : null }, staffId);
      setNotice(`${name.trim()}님을 등록했어요. 해피콜 목록에 앞으로의 안내가 올라갔어요.`);
      setName('');
      setPhone('');
      setDetoxStart('');
      await load();
    } catch {
      setError('등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setAdding(false);
    }
  }

  async function change(id: string, patch: ProgramPatch) {
    setPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      await updateDietProgram(supabase, id, patch, staffId);
    } catch {
      setError('저장하지 못했어요. 다시 시도해 주세요.');
      await load();
    }
  }

  async function step(p: DietProgram, kind: 'paid' | 'shipped' | 'ended') {
    if (kind === 'ended' && !(await confirmDialog(`${p.patientName}님 프로그램을 종료 처리할까요? (종료 안내 해피콜이 올라가고, 아직 안 한 앞으로의 안내는 없어져요)`, { confirmLabel: '종료' }))) return;
    setBusyId(p.id);
    setError('');
    try {
      await markDietStep(supabase, p.id, kind, staffId);
      setNotice(
        kind === 'paid'
          ? `${p.patientName}님 결제 확인 안내를 해피콜 목록에 올렸어요.`
          : kind === 'shipped'
            ? `${p.patientName}님 송장 안내를 해피콜 목록에 올렸어요${p.track === 'remote' ? '(내일 수령 확인도 함께)' : ''}.`
            : `${p.patientName}님을 종료 처리했어요. 종료 안내를 해피콜 목록에 올렸어요.`
      );
      await load();
    } catch {
      setError('처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(p: DietProgram) {
    if (!(await confirmDialog(`${p.patientName}님을 목록에서 삭제할까요? (아직 안 한 해피콜도 함께 지워져요. 이미 전화했거나 끝낸 해피콜은 남아요)`, { confirmLabel: '삭제' }))) return;
    try {
      await deleteDietProgram(supabase, p.id);
      setPrograms((prev) => prev.filter((x) => x.id !== p.id));
    } catch {
      setError('삭제하지 못했어요.');
    }
  }

  const active = programs.filter((p) => p.status === 'active');
  const ended = programs.filter((p) => p.status === 'ended');

  const row = (p: DietProgram) => {
    const end = medicineEndDate(p);
    const pill = dietPillStartDate(p);
    const isEnded = p.status === 'ended';
    return (
      <tr key={p.id} style={{ borderTop: '1px solid var(--color-line)', opacity: isEnded ? 0.7 : 1 }}>
        <td style={cell}>
          <div style={{ fontWeight: 700 }}>{p.patientName}</div>
          <div className="muted-text" style={{ fontSize: 11 }}>
            {TRACK_LABEL[p.track]}
            {p.phone ? ` · ${p.phone}` : ''}
          </div>
        </td>
        <td style={cell}>
          <div style={{ fontWeight: 700, color: 'var(--color-teal-deep)' }}>{phaseLabel(p, today)}</div>
          {end && !isEnded && <div className="muted-text" style={{ fontSize: 11 }}>약 소진 {koDate(end)}</div>}
        </td>
        <td style={cell}>
          <input type="date" className="input-field" value={p.detoxStartDate ?? ''} onChange={(e) => change(p.id, { detoxStartDate: e.target.value })} style={{ fontSize: 12, width: 130 }} aria-label={`${p.patientName} 디톡스 시작일`} />
          {pill && <div className="muted-text" style={{ fontSize: 11 }}>환 시작 {koDate(pill)}</div>}
        </td>
        <td style={cell}>
          <input type="number" min={1} className="input-field" value={p.weeks ?? ''} onChange={(e) => change(p.id, { weeks: e.target.value ? Number(e.target.value) : null })} style={{ fontSize: 12, width: 56 }} aria-label={`${p.patientName} 주수`} />
        </td>
        <td style={cell}>
          <input type="date" className="input-field" value={p.revisitDate ?? ''} onChange={(e) => change(p.id, { revisitDate: e.target.value })} style={{ fontSize: 12, width: 130 }} aria-label={`${p.patientName} 재진·2차 상담일`} />
        </td>
        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
          {!isEnded && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button type="button" disabled={busyId === p.id} onClick={() => step(p, 'paid')} style={{ fontSize: 12, padding: '3px 8px' }}>
                {p.paidAt ? '✓ ' : ''}결제 확인
              </button>
              <button type="button" disabled={busyId === p.id} onClick={() => step(p, 'shipped')} style={{ fontSize: 12, padding: '3px 8px' }}>
                {p.shippedAt ? '✓ ' : ''}발송 완료
              </button>
              <button type="button" disabled={busyId === p.id} onClick={() => step(p, 'ended')} style={{ fontSize: 12, padding: '3px 8px' }}>
                종료
              </button>
            </div>
          )}
          {isEnded && <span className="muted-text" style={{ fontSize: 12 }}>종료 {p.endedAt ? koDate(p.endedAt) : ''}</span>}
          <button type="button" onClick={() => remove(p)} style={{ fontSize: 11, padding: '2px 6px', color: '#b3261e', marginLeft: 4 }}>
            삭제
          </button>
        </td>
      </tr>
    );
  };

  const head = (
    <thead>
      <tr className="muted-text" style={{ fontSize: 11, textAlign: 'left' }}>
        {['환자', '단계', '디톡스 시작일', '주수', '재진·2차 상담일', '단계 단추'].map((h) => (
          <th key={h} style={{ ...cell, fontWeight: 600 }}>{h}</th>
        ))}
      </tr>
    </thead>
  );

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>린다이어트 환자</h1>
      <p className="muted-text" style={{ margin: '0 0 14px', fontSize: 13 }}>
        환자의 1차 관리는 린다이어트 차트에서 하고, 여기에는 <b>이름·디톡스 시작일·주수</b>만 적어 주세요. 날짜에 맞춰 해피콜 목록(데스크)과 케어 보드(원장님)에 안내할 일이 자동으로 올라가요.
      </p>

      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>+ 환자 등록 <span className="muted-text" style={{ fontWeight: 400, fontSize: 12 }}>(진료·상담을 마친 뒤에 등록하면 "진료 후 안내"가 바로 올라가요. 디톡스를 이미 시작한 분은 이 안내 없이 등록돼요)</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={labelStyle}>
            환자명
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} style={{ display: 'block', width: 110, fontSize: 13 }} />
          </label>
          <label style={labelStyle}>
            연락처
            <input className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ display: 'block', width: 125, fontSize: 13 }} />
          </label>
          <label style={labelStyle}>
            진료방식
            <select value={track} onChange={(e) => setTrack(e.target.value as DietTrack)} style={{ display: 'block', fontSize: 13, padding: 4 }}>
              <option value="visit">대면</option>
              <option value="remote">비대면</option>
            </select>
          </label>
          <label style={labelStyle}>
            디톡스 시작일
            <input type="date" className="input-field" value={detoxStart} onChange={(e) => setDetoxStart(e.target.value)} style={{ display: 'block', fontSize: 13 }} />
          </label>
          <label style={labelStyle}>
            주수
            <input type="number" min={1} className="input-field" value={weeks} onChange={(e) => setWeeks(e.target.value)} style={{ display: 'block', width: 56, fontSize: 13 }} />
          </label>
          <button type="button" className="btn-primary" disabled={!name.trim() || adding} onClick={() => void add()} style={{ fontSize: 13, padding: '6px 14px' }}>
            {adding ? '등록 중…' : '등록'}
          </button>
        </div>
      </div>

      {notice && <p style={{ color: 'var(--color-green)', fontWeight: 600, fontSize: 13 }}>✔ {notice}</p>}
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted-text">불러오는 중…</p>}
      {!loading && !error && active.length === 0 && <p className="muted-text">진행 중인 린다이어트 환자가 없어요.</p>}

      {active.length > 0 && (
        <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            {head}
            <tbody>{active.map(row)}</tbody>
          </table>
        </div>
      )}

      {ended.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={() => setShowEnded((v) => !v)} style={{ fontSize: 13, background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--color-muted)', cursor: 'pointer' }}>
            {showEnded ? '▾' : '▸'} 종료된 환자 {ended.length}명
          </button>
          {showEnded && (
            <div className="card" style={{ padding: 8, overflowX: 'auto', marginTop: 6 }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                {head}
                <tbody>{ended.map(row)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
