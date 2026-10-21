'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PatientSearch } from '@/components/herbCompounding/PatientSearch';
import { confirmDialog } from '@/lib/confirmDialog';
import { koDate } from '@/lib/dietScripts';
import { herbCareStatus } from '@/lib/herbCare';
import { diffDaysKst, todayKst } from '@/lib/kst';
import { createClient } from '@/lib/supabase/client';
import { listKnownHerbCompoundingPatients, type KnownHerbPatient } from '@/lib/supabase/herbCompounding';
import { addCarePatient, listCarePatients, loadCarePatientStatus, updateCarePatient, type CarePatientStatus } from '@/lib/supabase/herbCare';

const labelStyle = { fontSize: 11, color: 'var(--color-muted)', marginBottom: 1 } as const;
const valueStyle = { fontSize: 13, fontWeight: 600 } as const;

function Stat({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <div style={{ minWidth: 92 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ ...valueStyle, color: warn ? 'var(--color-error)' : undefined }}>{children}</div>
    </div>
  );
}

function PatientCard({ p, today, onMemo, onEnd, onResume }: { p: CarePatientStatus; today: string; onMemo: (id: string, memo: string) => Promise<void>; onEnd: (p: CarePatientStatus) => void; onResume: (p: CarePatientStatus) => void }) {
  const [memo, setMemo] = useState(p.memo);
  const [saved, setSaved] = useState(false);
  const ended = p.status === 'ended';
  const { herb, balance, calls } = p;
  const sinceLast = calls.lastCallDate ? diffDaysKst(calls.lastCallDate, today) : null;
  const nextOverdue = calls.nextCallDate != null && calls.nextCallDate < today;

  async function saveMemo() {
    if (memo === p.memo) return;
    await onMemo(p.id, memo);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10, opacity: ended ? 0.75 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>{p.patientName}</span>
        {p.chartNo && <span className="muted-text" style={{ fontSize: 12 }}>차트 {p.chartNo}</span>}
        {ended && <span className="muted-text" style={{ fontSize: 12 }}>종료{p.endedAt ? ` ${koDate(p.endedAt)}` : ''}</span>}
        <span style={{ flex: 1 }} />
        {ended ? (
          <button type="button" onClick={() => onResume(p)} style={{ fontSize: 12, padding: '3px 10px' }}>
            다시 진행
          </button>
        ) : (
          <button type="button" onClick={() => onEnd(p)} style={{ fontSize: 12, padding: '3px 10px' }}>
            종료
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', rowGap: 8 }}>
        <Stat label="최근 처방">
          {herb ? (
            <>
              {herb.prescriptionName || '처방명 없음'}
              <span className="muted-text" style={{ fontSize: 11, fontWeight: 400 }}>
                {' '}
                · {koDate(herb.orderDate)}
                {herb.days > 0 ? ` · ${herb.days}일분` : ''}
              </span>
            </>
          ) : (
            '처방전 없음'
          )}
        </Stat>
        <Stat label="복용">
          {herb ? herbCareStatus(herb) : '-'}
          {herb?.pickupMissing && <span className="muted-text" style={{ fontSize: 11, fontWeight: 400 }}> · 수령일 미입력</span>}
        </Stat>
        <Stat label="한약 결제 일수">{balance ? `${balance.totalDays}일` : '패키지 없음'}</Stat>
        <Stat label="처방한 일수">{balance ? `${balance.usedDays}일` : '-'}</Stat>
        <Stat label="잔여 일수" warn={!!balance && balance.remainingDays <= 14}>
          {balance ? (balance.overDays > 0 ? `${balance.overDays}일 초과` : `${balance.remainingDays}일`) : '-'}
        </Stat>
        <Stat label="마지막 해피콜">
          {calls.lastCallDate ? (
            <>
              {koDate(calls.lastCallDate)}
              <span className="muted-text" style={{ fontSize: 11, fontWeight: 400 }}> · {sinceLast === 0 ? '오늘' : `${sinceLast}일 지남`}</span>
            </>
          ) : (
            '기록 없음'
          )}
        </Stat>
        <Stat label="다음 해피콜" warn={nextOverdue}>
          {calls.nextCallDate ? (
            <>
              {koDate(calls.nextCallDate)}
              {nextOverdue && <span style={{ fontSize: 11, fontWeight: 400 }}> · {diffDaysKst(calls.nextCallDate, today)}일 밀림</span>}
            </>
          ) : (
            '예정 없음'
          )}
        </Stat>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
          <span>메모 — 이번 해피콜에서 중점적으로 볼 것, 저번 해피콜에서 상담한 내용</span>
          {saved && <span style={{ color: 'var(--color-green)' }}>✓ 저장했어요</span>}
        </div>
        <textarea
          className="input-field"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => void saveMemo()}
          rows={5}
          placeholder={'중점: 수면·소화 확인, 다음 처방 상담\n저번 해피콜(10/14): 복용 후 속쓰림 호소, 식후 30분 복용으로 안내함'}
          style={{ width: '100%', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }}
        />
      </div>
    </div>
  );
}

// 케어 보드의 "한약 환자" — 원장이 직접 고른 환자의 처방·한약 패키지(결제·처방·잔여 일수)·해피콜 현황과 메모를 한 카드에서 본다
// (원장 요청, 2026-10-21). 환자명을 치면 처방전에 있는 환자가 떠서 차트번호까지 한 번에 고를 수 있다.
export function CareHerbPatients() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayKst();
  const [patients, setPatients] = useState<CarePatientStatus[]>([]);
  const [known, setKnown] = useState<KnownHerbPatient[]>([]);
  const [name, setName] = useState('');
  const [chart, setChart] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEnded, setShowEnded] = useState(false);

  const reload = useCallback(async () => {
    try {
      setPatients(await loadCarePatientStatus(supabase, await listCarePatients(supabase), today));
      setError('');
    } catch {
      setError('등록한 환자를 불러오지 못했어요. (케어 보드 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    } finally {
      setLoading(false);
    }
  }, [supabase, today]);

  useEffect(() => {
    void reload();
    listKnownHerbCompoundingPatients(supabase, 3000).then(setKnown, () => setKnown([]));
  }, [reload, supabase]);

  async function add() {
    if (!name.trim() || adding) return;
    setAdding(true);
    setError('');
    try {
      await addCarePatient(supabase, { patientName: name, chartNo: chart });
      setName('');
      setChart('');
      await reload();
    } catch {
      setError('등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setAdding(false);
    }
  }

  async function saveMemo(id: string, memo: string) {
    try {
      await updateCarePatient(supabase, id, { memo });
      setPatients((prev) => prev.map((p) => (p.id === id ? { ...p, memo } : p)));
    } catch {
      setError('메모를 저장하지 못했어요. 다시 시도해 주세요.');
    }
  }

  async function end(p: CarePatientStatus) {
    if (!(await confirmDialog(`${p.patientName}님을 종료할까요? (메모는 남고, "종료된 환자"에서 다시 진행할 수 있어요)`, { confirmLabel: '종료' }))) return;
    try {
      await updateCarePatient(supabase, p.id, { status: 'ended', endedAt: today });
      setPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'ended', endedAt: today } : x)));
    } catch {
      setError('종료하지 못했어요. (케어 보드 종료 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    }
  }

  async function resume(p: CarePatientStatus) {
    try {
      await updateCarePatient(supabase, p.id, { status: 'active', endedAt: null });
      setPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'active', endedAt: null } : x)));
    } catch {
      setError('다시 진행하지 못했어요.');
    }
  }

  const active = patients.filter((p) => p.status === 'active');
  const ended = patients.filter((p) => p.status === 'ended');

  return (
    <div>
      <h2 style={{ fontSize: 17, margin: '20px 0 8px' }}>🌿 한약 환자 ({active.length}명)</h2>
      <p className="muted-text" style={{ margin: '0 0 8px', fontSize: 12 }}>
        챙기고 싶은 환자를 직접 등록하세요. 환자명을 치면 처방전에 있는 환자가 떠서 차트번호까지 한 번에 고를 수 있어요. 패키지를 결제한 환자 전체는{' '}
        <Link href="/herb-packages" style={{ textDecoration: 'underline' }}>
          한약 패키지 현황
        </Link>
        에서 볼 수 있어요.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <label style={{ fontSize: 12, width: 190 }}>
          환자명
          <PatientSearch
            value={name}
            onChange={setName}
            knownPatients={known}
            onPick={(p) => {
              setName(p.patientName);
              setChart(p.chartNo);
            }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          차트번호
          <input className="input-field" value={chart} onChange={(e) => setChart(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} placeholder="환자를 고르면 채워져요" style={{ display: 'block', width: 150, fontSize: 13 }} />
        </label>
        <button type="button" className="btn-primary" disabled={!name.trim() || adding} onClick={() => void add()} style={{ fontSize: 13, padding: '6px 14px' }}>
          {adding ? '등록 중…' : '등록'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted-text">불러오는 중…</p>}
      {!loading && !error && active.length === 0 && <p className="muted-text">아직 등록한 환자가 없어요.</p>}
      {active.map((p) => (
        <PatientCard key={p.id} p={p} today={today} onMemo={saveMemo} onEnd={end} onResume={resume} />
      ))}

      {ended.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setShowEnded((v) => !v)} style={{ fontSize: 13, background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--color-muted)', cursor: 'pointer' }}>
            {showEnded ? '▾' : '▸'} 종료된 환자 {ended.length}명
          </button>
          {showEnded && ended.map((p) => <PatientCard key={p.id} p={p} today={today} onMemo={saveMemo} onEnd={end} onResume={resume} />)}
        </div>
      )}
    </div>
  );
}
