'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DietProgramCard } from '@/components/diet/DietProgramCard';
import { confirmDialog } from '@/lib/confirmDialog';
import type { DietProgram, DietTrack } from '@/lib/dietProgram';
import { createClient } from '@/lib/supabase/client';
import { createDietProgram, deleteDietProgram, listDietPrograms, updateDietProgram, type ProgramPatch } from '@/lib/supabase/dietPrograms';
import { currentStaff } from '@/lib/supabase/herbQueue';

// 린다이어트 프로그램 카드 관리(데스크·원장 공용) — 단계마다 날짜를 채워 두면 원장 카톡 일정(케어 보드)이 자동으로 계산된다
// (원장 요청, 2026-10-20. 기준은 온유한의원 사례의 대면/비대면 해피콜 문서).
export default function DietProgramsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [programs, setPrograms] = useState<DietProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEnded, setShowEnded] = useState(false);

  const [name, setName] = useState('');
  const [chartNo, setChartNo] = useState('');
  const [phone, setPhone] = useState('');
  const [track, setTrack] = useState<DietTrack>('visit');
  const [firstDate, setFirstDate] = useState('');
  const [weeks, setWeeks] = useState('12');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setPrograms(await listDietPrograms(supabase));
      setError('');
    } catch {
      setError('린다이어트 프로그램을 불러오지 못했어요. (프로그램 카드 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!name.trim() || adding) return;
    setAdding(true);
    setError('');
    try {
      const me = await currentStaff(supabase);
      await createDietProgram(supabase, { patientName: name, chartNo, phone, track, firstDate, weeks: weeks ? Number(weeks) : null }, me.id);
      setName('');
      setChartNo('');
      setPhone('');
      setFirstDate('');
      await load();
    } catch {
      setError('등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setAdding(false);
    }
  }

  async function change(id: string, patch: ProgramPatch) {
    // 화면은 바로 바꾸고, 저장에 실패하면 서버 값으로 되돌린다.
    setPrograms((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    try {
      await updateDietProgram(supabase, id, patch);
    } catch {
      setError('저장하지 못했어요. 다시 시도해 주세요.');
      await load();
    }
  }

  async function remove(p: DietProgram) {
    if (!(await confirmDialog(`${p.patientName}님 프로그램 카드를 삭제할까요? (원장 카톡 보냄 기록도 함께 지워져요)`, { confirmLabel: '삭제' }))) return;
    try {
      await deleteDietProgram(supabase, p.id);
      setPrograms((prev) => prev.filter((x) => x.id !== p.id));
    } catch {
      setError('삭제하지 못했어요.');
    }
  }

  const active = programs.filter((p) => p.status === 'active');
  const ended = programs.filter((p) => p.status === 'ended');

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>린다이어트 관리</h1>
      <p className="muted-text" style={{ margin: '0 0 14px', fontSize: 13 }}>
        환자마다 카드를 만들고 단계가 지날 때마다 날짜를 채워 주세요(결제 확인·발송·디톡스 시작일·마지막 기록 등). 채워진 날짜로 원장님이 카톡을 보낼 날이 자동으로 계산돼요.
      </p>

      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>+ 린다이어트 환자 등록</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12 }}>
            환자명
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} style={{ display: 'block', width: 120, fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            차트번호
            <input className="input-field" value={chartNo} onChange={(e) => setChartNo(e.target.value)} style={{ display: 'block', width: 100, fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            연락처
            <input className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ display: 'block', width: 130, fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            진료방식
            <select value={track} onChange={(e) => setTrack(e.target.value as DietTrack)} style={{ display: 'block', fontSize: 13, padding: '4px' }}>
              <option value="visit">대면</option>
              <option value="remote">비대면</option>
            </select>
          </label>
          <label style={{ fontSize: 12 }}>
            {track === 'visit' ? '초진일' : '첫 상담일'}
            <input type="date" className="input-field" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} style={{ display: 'block', fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            주수
            <input type="number" min={1} className="input-field" value={weeks} onChange={(e) => setWeeks(e.target.value)} style={{ display: 'block', width: 60, fontSize: 13 }} />
          </label>
          <button type="button" className="btn-primary" disabled={!name.trim() || adding} onClick={() => void add()} style={{ fontSize: 13, padding: '6px 14px' }}>
            {adding ? '등록 중…' : '등록'}
          </button>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted-text">불러오는 중…</p>}

      {!loading && !error && active.length === 0 && <p className="muted-text">진행 중인 린다이어트 환자가 없어요.</p>}
      {active.map((p) => (
        <DietProgramCard key={p.id} program={p} onChange={change} onDelete={remove} />
      ))}

      {ended.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={() => setShowEnded((v) => !v)} style={{ fontSize: 13, background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--color-muted)', cursor: 'pointer' }}>
            {showEnded ? '▾' : '▸'} 종료된 환자 {ended.length}명
          </button>
          {showEnded && ended.map((p) => <DietProgramCard key={p.id} program={p} onChange={change} onDelete={remove} />)}
        </div>
      )}
    </div>
  );
}
