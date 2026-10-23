'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PatientSearch } from '@/components/herbCompounding/PatientSearch';
import { confirmDialog } from '@/lib/confirmDialog';
import { medicineEndDate, phaseLabel } from '@/lib/dietProgram';
import { koDate } from '@/lib/dietScripts';
import { herbCareStatus, prescriptionLabel } from '@/lib/herbCare';
import { diffDaysKst, todayKst } from '@/lib/kst';
import { createClient } from '@/lib/supabase/client';
import { listKnownHerbCompoundingPatients, type KnownHerbPatient } from '@/lib/supabase/herbCompounding';
import { listDietPrograms } from '@/lib/supabase/dietPrograms';
import { addCarePatient, listCarePatients, listKnownDietPatients, loadCarePatientStatus, updateCarePatient, type CareKind, type CarePatientPatch, type CarePatientStatus } from '@/lib/supabase/herbCare';
import { addManualPackage, deleteManualPackage } from '@/lib/supabase/herbPackages';

const labelStyle = { fontSize: 11, color: 'var(--color-muted)', marginBottom: 1 } as const;
const PACKAGE_PRESETS = [30, 60, 90, 120];

function Stat({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: warn ? 'var(--color-error)' : undefined, whiteSpace: 'nowrap' }}>{children}</div>
    </div>
  );
}

interface CardProps {
  p: CarePatientStatus;
  today: string;
  onPatch: (p: CarePatientStatus, patch: CarePatientPatch) => Promise<void>;
  onEnd: (p: CarePatientStatus) => void;
  onResume: (p: CarePatientStatus) => void;
  onPackagesChanged: () => Promise<void>;
}

function PatientCard({ p, today, onPatch, onEnd, onResume, onPackagesChanged }: CardProps) {
  const supabase = useMemo(() => createClient(), []);
  const [memo, setMemo] = useState(p.memo);
  const [saved, setSaved] = useState(false);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [pkgDays, setPkgDays] = useState('90');
  const [pkgDate, setPkgDate] = useState(today);
  const [pkgBusy, setPkgBusy] = useState(false);
  const ended = p.status === 'ended';
  const { herb, balance, desk, program } = p;
  const isDiet = p.kind === 'diet';
  const programEnd = program ? medicineEndDate(program) : null;

  // 마지막 해피콜은 데스크 해피콜 목록과 원장이 직접 마친 해피콜 중 더 늦은 날
  const lastCall = [desk.lastCallDate, p.lastCallDate].filter((d): d is string => !!d).sort().pop() ?? null;
  const sinceLast = lastCall ? diffDaysKst(lastCall, today) : null;
  const dueNow = !!p.nextCallDate && p.nextCallDate <= today;
  const label = herb ? prescriptionLabel(herb) : '';

  async function saveMemo() {
    if (memo === p.memo) return;
    await onPatch(p, { memo });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function addPackage() {
    const days = Number(pkgDays);
    if (!days || days < 1 || pkgBusy) return;
    setPkgBusy(true);
    try {
      await addManualPackage(supabase, { patientName: p.patientName, chartNo: p.chartNo, totalDays: days, startDate: pkgDate || today });
      setPkgOpen(false);
      await onPackagesChanged();
    } finally {
      setPkgBusy(false);
    }
  }

  async function removePackage(id: string) {
    if (!(await confirmDialog('이 결제 일수를 지울까요? (직접 넣은 것만 지울 수 있어요)', { confirmLabel: '지우기' }))) return;
    await deleteManualPackage(supabase, id);
    await onPackagesChanged();
  }

  return (
    <div className="card" style={{ padding: 10, marginBottom: 8, opacity: ended ? 0.75 : 1, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
      <div style={{ flex: '1 1 440px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{p.patientName}</span>
          {p.chartNo && <span className="muted-text" style={{ fontSize: 11 }}>차트 {p.chartNo}</span>}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-teal-deep)' }}>
            {isDiet ? (program ? phaseLabel(program, today) : '프로그램 없음') : label || (herb ? '처방명 없음' : '처방전 없음')}
          </span>
          {!isDiet && herb && (
            <span className="muted-text" style={{ fontSize: 11 }}>
              {koDate(herb.orderDate)}
              {herb.days > 0 ? ` · ${herb.days}일분` : ''}
            </span>
          )}
          {ended && <span className="muted-text" style={{ fontSize: 11 }}>종료{p.endedAt ? ` ${koDate(p.endedAt)}` : ''}</span>}
          <span style={{ flex: 1 }} />
          {ended ? (
            <button type="button" onClick={() => onResume(p)} style={{ fontSize: 11, padding: '2px 8px' }}>
              다시 진행
            </button>
          ) : (
            <button type="button" onClick={() => onEnd(p)} style={{ fontSize: 11, padding: '2px 8px' }}>
              종료
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', rowGap: 6, alignItems: 'flex-start' }}>
          {isDiet ? (
            <>
              <Stat label="약 소진 예정">{programEnd ? `${koDate(programEnd)} (D-${Math.max(0, diffDaysKst(today, programEnd))})` : '-'}</Stat>
              {!program && <span className="muted-text" style={{ fontSize: 11, alignSelf: 'center' }}>비급여 현황에서 린다이어트 디톡스 시작일을 등록하면 단계가 연결돼요</span>}
            </>
          ) : (
            <>
          <Stat label="복용">
            {herb ? herbCareStatus(herb) : '-'}
            {herb?.pickupMissing && <span className="muted-text" style={{ fontSize: 10, fontWeight: 400 }}> (수령일 미입력)</span>}
          </Stat>
          <Stat label="결제 일수">{balance ? `${balance.totalDays}일` : '-'}</Stat>
          <Stat label="처방한 일수">{balance ? `${balance.usedDays}일` : '-'}</Stat>
          <Stat label="잔여 일수" warn={!!balance && balance.remainingDays <= 14}>
            {balance ? (balance.overDays > 0 ? `${balance.overDays}일 초과` : `${balance.remainingDays}일`) : '-'}
          </Stat>
            </>
          )}
          <Stat label="마지막 해피콜">
            {lastCall ? (
              <>
                {koDate(lastCall)}
                <span className="muted-text" style={{ fontSize: 10, fontWeight: 400 }}> {sinceLast === 0 ? '오늘' : `${sinceLast}일 지남`}</span>
              </>
            ) : (
              '기록 없음'
            )}
          </Stat>
          <div>
            <div style={labelStyle}>다음 해피콜 (정하면 그날 오늘 연락할 분에 떠요)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="date"
                className="input-field"
                value={p.nextCallDate ?? ''}
                disabled={ended}
                onChange={(e) => void onPatch(p, { nextCallDate: e.target.value })}
                style={{ fontSize: 12, padding: '2px 4px', width: 128 }}
                aria-label={`${p.patientName} 다음 해피콜 날짜`}
              />
              {p.nextCallDate && !ended && (
                <button type="button" onClick={() => void onPatch(p, { nextCallDate: '' })} title="날짜 지우기" style={{ fontSize: 11, padding: '1px 6px' }}>
                  ✕
                </button>
              )}
              {dueNow && !ended && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-error)' }}>
                  {p.nextCallDate === today ? '오늘!' : `${diffDaysKst(p.nextCallDate as string, today)}일 밀림`}
                </span>
              )}
            </div>
            {!p.nextCallDate && desk.nextCallDate && (
              <div className="muted-text" style={{ fontSize: 10 }}>데스크 해피콜 예정 {koDate(desk.nextCallDate)}</div>
            )}
          </div>
        </div>

        {!ended && !isDiet && (
          <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {p.packages.map((k) => (
              <span key={k.id} className="muted-text" style={{ fontSize: 11 }}>
                📦 {k.totalDays}일 · {koDate(k.startDate)} 결제{k.manual ? ' (직접 입력)' : ''}
                {k.manual && (
                  <button type="button" onClick={() => void removePackage(k.id)} title="지우기" style={{ fontSize: 10, padding: '0 4px', marginLeft: 3 }}>
                    ✕
                  </button>
                )}
              </span>
            ))}
            <button type="button" onClick={() => setPkgOpen((v) => !v)} style={{ fontSize: 11, padding: '1px 8px' }}>
              {pkgOpen ? '닫기' : p.packages.length > 0 ? '+ 결제 추가' : '+ 결제 일수 입력'}
            </button>
            {pkgOpen && (
              <>
                <select value={PACKAGE_PRESETS.includes(Number(pkgDays)) ? pkgDays : ''} onChange={(e) => e.target.value && setPkgDays(e.target.value)} style={{ fontSize: 12, padding: 2 }} aria-label="결제 일수">
                  {PACKAGE_PRESETS.map((d) => (
                    <option key={d} value={d}>
                      {d}일
                    </option>
                  ))}
                  <option value="">직접</option>
                </select>
                <input type="number" min={1} className="input-field" value={pkgDays} onChange={(e) => setPkgDays(e.target.value)} style={{ width: 54, fontSize: 12, padding: '2px 4px' }} aria-label="결제 일수 직접 입력" />
                <span className="muted-text" style={{ fontSize: 11 }}>일 · 결제일</span>
                <input type="date" className="input-field" value={pkgDate} onChange={(e) => setPkgDate(e.target.value)} style={{ fontSize: 12, padding: '2px 4px', width: 128 }} aria-label="결제일" />
                <button type="button" className="btn-primary" disabled={pkgBusy} onClick={() => void addPackage()} style={{ fontSize: 11, padding: '2px 10px' }}>
                  추가
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: '0 1 300px', minWidth: 230, display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
          <span>메모 — 중점적으로 볼 것 · 저번 상담 내용</span>
          {saved && <span style={{ color: 'var(--color-green)' }}>✓ 저장</span>}
        </div>
        <textarea
          className="input-field"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => void saveMemo()}
          placeholder={'중점: 수면·소화 확인\n저번(10/14): 속쓰림 호소, 식후 30분 복용 안내'}
          style={{ width: '100%', flex: 1, minHeight: 78, fontSize: 12, lineHeight: 1.45, resize: 'vertical' }}
        />
      </div>
    </div>
  );
}

// 케어 보드의 "한약 환자" — 원장이 직접 고른 환자의 처방명·한약 패키지(결제·처방·잔여 일수)·해피콜 현황과 메모를 한 카드에서 본다
// (원장 요청, 2026-10-21). 환자명을 치면 처방전에 있는 환자가 떠서 차트번호까지 한 번에 고를 수 있고, 다음 해피콜 날짜를 정하면
// 그날 "오늘 연락할 분"에 올라간다(onCallsChanged로 위쪽 목록을 다시 읽는다).
export function CareHerbPatients({ kind = 'herb', reloadKey, onCallsChanged }: { kind?: CareKind; reloadKey: number; onCallsChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const today = todayKst();
  const [patients, setPatients] = useState<CarePatientStatus[]>([]);
  const [known, setKnown] = useState<KnownHerbPatient[]>([]);
  const [name, setName] = useState('');
  const [chart, setChart] = useState('');
  const [days, setDays] = useState('');
  const [paidDate, setPaidDate] = useState(today);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEnded, setShowEnded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const all = await listCarePatients(supabase);
      const mine = all.filter((p) => p.kind === kind);
      // 린다이어트 환자는 비급여에서 만든 프로그램과 이름·차트번호로 연결해 단계를 보여 준다.
      const programs = kind === 'diet' ? await listDietPrograms(supabase).catch(() => []) : [];
      setPatients(await loadCarePatientStatus(supabase, mine, today, programs));
      setError('');
    } catch {
      setError('등록한 환자를 불러오지 못했어요. (케어 보드 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    } finally {
      setLoading(false);
    }
  }, [supabase, today, kind]);

  useEffect(() => {
    void reload();
  }, [reload, reloadKey]);

  useEffect(() => {
    const load = kind === 'diet' ? listKnownDietPatients(supabase) : listKnownHerbCompoundingPatients(supabase, 3000);
    load.then(setKnown, () => setKnown([]));
  }, [supabase, kind]);

  async function add() {
    if (!name.trim() || adding) return;
    setAdding(true);
    setError('');
    try {
      await addCarePatient(supabase, { patientName: name, chartNo: chart, kind });
      const d = Number(days);
      // 이미 결제한 한약 환자는 결제 일수를 같이 넣을 수 있다 — 결제일 이후의 처방전이 차감돼 처방한 일수·잔여 일수가 자동으로 나온다.
      if (kind === 'herb' && d > 0) await addManualPackage(supabase, { patientName: name, chartNo: chart, totalDays: d, startDate: paidDate || today });
      setName('');
      setChart('');
      setDays('');
      await reload();
    } catch {
      setError('등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setAdding(false);
    }
  }

  async function patch(p: CarePatientStatus, change: CarePatientPatch) {
    try {
      await updateCarePatient(supabase, p.id, change);
      setPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...('memo' in change ? { memo: change.memo as string } : {}), ...('nextCallDate' in change ? { nextCallDate: change.nextCallDate || null } : {}) } : x)));
      // 날짜를 바꿨거나 메모를 고쳤으면 위쪽 "오늘 연락할 분" 카드도 새 내용으로 다시 읽는다.
      if ('nextCallDate' in change || 'memo' in change) onCallsChanged();
    } catch {
      setError('저장하지 못했어요. 다시 시도해 주세요. (케어 보드 해피콜 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    }
  }

  async function end(p: CarePatientStatus) {
    if (!(await confirmDialog(`${p.patientName}님을 종료할까요? (메모는 남고, "종료된 환자"에서 다시 진행할 수 있어요)`, { confirmLabel: '종료' }))) return;
    try {
      await updateCarePatient(supabase, p.id, { status: 'ended', endedAt: today });
      setPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'ended', endedAt: today } : x)));
      onCallsChanged();
    } catch {
      setError('종료하지 못했어요. (케어 보드 종료 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    }
  }

  async function resume(p: CarePatientStatus) {
    try {
      await updateCarePatient(supabase, p.id, { status: 'active', endedAt: null });
      setPatients((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'active', endedAt: null } : x)));
      onCallsChanged();
    } catch {
      setError('다시 진행하지 못했어요.');
    }
  }

  const active = patients.filter((p) => p.status === 'active');
  const ended = patients.filter((p) => p.status === 'ended');
  const cardProps = { today, onPatch: patch, onEnd: end, onResume: resume, onPackagesChanged: reload };

  return (
    <div>
      <h2 style={{ fontSize: 17, margin: '20px 0 8px' }}>
        {kind === 'diet' ? '🥗 린다이어트 환자' : '🌿 한약 환자'} ({active.length}명)
      </h2>
      <p className="muted-text" style={{ margin: '0 0 8px', fontSize: 12 }}>
        {kind === 'diet' ? (
          <>챙기고 싶은 린다이어트 환자를 직접 등록하세요. 이름을 치면 비급여 현황에서 린다이어트를 결제한 환자가 떠서 차트번호까지 한 번에 고를 수 있어요. 다음 해피콜 날짜를 정하면 그날 &quot;오늘 연락할 분&quot;에 떠요.</>
        ) : (
          <>
            챙기고 싶은 환자를 직접 등록하세요. 환자명을 치면 처방전에 있는 환자가 떠서 차트번호까지 한 번에 고를 수 있어요. 비급여 현황에서 한약 결제 일수를 넣은 환자는 결제·처방·잔여 일수가 자동으로 나와요(이전에 결제한 환자는 아래 &quot;결제 일수&quot;에 넣어 주세요). 패키지 전체는{' '}
            <Link href="/herb-packages" style={{ textDecoration: 'underline' }}>
              한약 패키지 현황
            </Link>
            에서 볼 수 있어요.
          </>
        )}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
        <label style={{ fontSize: 12, width: 180 }}>
          환자명
          <PatientSearch
            value={name}
            onChange={setName}
            knownPatients={known}
            onPick={(k) => {
              setName(k.patientName);
              setChart(k.chartNo);
            }}
          />
        </label>
        <label style={{ fontSize: 12 }}>
          차트번호
          <input className="input-field" value={chart} onChange={(e) => setChart(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} placeholder="고르면 채워져요" style={{ display: 'block', width: 120, fontSize: 13 }} />
        </label>
        {kind === 'herb' && (
        <label style={{ fontSize: 12 }}>
          결제 일수(선택)
          <select value={days} onChange={(e) => setDays(e.target.value)} style={{ display: 'block', fontSize: 13, padding: 4 }}>
            <option value="">없음</option>
            {PACKAGE_PRESETS.map((d) => (
              <option key={d} value={d}>
                {d}일
              </option>
            ))}
          </select>
        </label>
        )}
        {kind === 'herb' && days && (
          <label style={{ fontSize: 12 }}>
            결제일
            <input type="date" className="input-field" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} style={{ display: 'block', fontSize: 13 }} />
          </label>
        )}
        <button type="button" className="btn-primary" disabled={!name.trim() || adding} onClick={() => void add()} style={{ fontSize: 13, padding: '6px 14px' }}>
          {adding ? '등록 중…' : '등록'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted-text">불러오는 중…</p>}
      {!loading && !error && active.length === 0 && <p className="muted-text">아직 등록한 환자가 없어요.</p>}
      {active.map((p) => (
        <PatientCard key={p.id} p={p} {...cardProps} />
      ))}

      {ended.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setShowEnded((v) => !v)} style={{ fontSize: 13, background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--color-muted)', cursor: 'pointer' }}>
            {showEnded ? '▾' : '▸'} 종료된 환자 {ended.length}명
          </button>
          {showEnded && ended.map((p) => <PatientCard key={p.id} p={p} {...cardProps} />)}
        </div>
      )}
    </div>
  );
}
