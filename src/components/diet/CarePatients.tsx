'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PatientSearch } from '@/components/herbCompounding/PatientSearch';
import { CARE_KINDS, CARE_KIND_LABEL, CARE_KIND_SHORT, type CareKind } from '@/lib/careKind';
import { confirmDialog } from '@/lib/confirmDialog';
import { medicineEndDate, phaseLabel } from '@/lib/dietProgram';
import { koDate } from '@/lib/dietScripts';
import { herbCareStatus, prescriptionLabel } from '@/lib/herbCare';
import { diffDaysKst, todayKst } from '@/lib/kst';
import { createClient } from '@/lib/supabase/client';
import { listDietPrograms } from '@/lib/supabase/dietPrograms';
import { addCarePatient, deleteCarePatient, listCarePatients, listKnownPurchasePatients, loadCarePatientStatus, updateCarePatient, type CarePatientPatch, type CarePatientStatus } from '@/lib/supabase/herbCare';
import { listKnownHerbCompoundingPatients, type KnownHerbPatient } from '@/lib/supabase/herbCompounding';
import { addManualPackage, deleteManualPackage } from '@/lib/supabase/herbPackages';

const labelStyle = { fontSize: 11, color: 'var(--color-muted)', marginBottom: 1 } as const;
const PACKAGE_PRESETS = [30, 60, 90, 120];
const KIND_EMOJI: Record<CareKind, string> = { herb: '🌿', diet: '🥗', special: '💎' };

function Stat({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <span className="muted-text" style={{ fontSize: 11 }}>
        {label}{' '}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: warn ? 'var(--color-error)' : undefined }}>{children}</span>
    </span>
  );
}

interface CardProps {
  p: CarePatientStatus;
  today: string;
  onPatch: (p: CarePatientStatus, patch: CarePatientPatch) => Promise<void>;
  onEnd: (p: CarePatientStatus) => void;
  onResume: (p: CarePatientStatus) => void;
  onDelete: (p: CarePatientStatus) => void;
  onKind: (p: CarePatientStatus, kind: CareKind) => void;
  onPackagesChanged: () => Promise<void>;
}

function PatientCard({ p, today, onPatch, onEnd, onResume, onDelete, onKind, onPackagesChanged }: CardProps) {
  const supabase = useMemo(() => createClient(), []);
  const [memo, setMemo] = useState(p.memo);
  const [saved, setSaved] = useState(false);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [pkgDays, setPkgDays] = useState('90');
  const [pkgDate, setPkgDate] = useState(today);
  const [pkgBusy, setPkgBusy] = useState(false);
  const ended = p.status === 'ended';
  const { herb, balance, desk, program, lastSpecial } = p;
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

  const headLabel =
    p.kind === 'diet'
      ? program
        ? phaseLabel(program, today)
        : '프로그램 없음'
      : p.kind === 'special'
        ? lastSpecial
          ? lastSpecial.productName
          : '최근 결제 없음'
        : label || (herb ? '처방명 없음' : '처방전 없음');

  const [memoFocus, setMemoFocus] = useState(false);

  return (
    <div className="card" style={{ padding: '6px 10px', marginBottom: 6, opacity: ended ? 0.75 : 1, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 480px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>{p.patientName}</span>
          {p.chartNo && <span className="muted-text" style={{ fontSize: 11 }}>{p.chartNo}</span>}
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-teal-deep)' }}>{headLabel}</span>
          {p.kind === 'herb' && herb && (
            <span className="muted-text" style={{ fontSize: 11 }}>
              {koDate(herb.orderDate)}
              {herb.days > 0 ? ` · ${herb.days}일분` : ''}
            </span>
          )}
          {p.kind === 'special' && lastSpecial && <span className="muted-text" style={{ fontSize: 11 }}>{koDate(lastSpecial.purchaseDate)} 결제</span>}
          {ended && <span className="muted-text" style={{ fontSize: 11 }}>종료{p.endedAt ? ` ${koDate(p.endedAt)}` : ''}</span>}
          <span style={{ flex: 1 }} />
          <select value={p.kind} onChange={(e) => onKind(p, e.target.value as CareKind)} title="종류를 바꾸면 그 구역으로 옮겨져요" aria-label={`${p.patientName} 종류`} style={{ fontSize: 11, padding: '0 2px' }}>
            {CARE_KINDS.map((k) => (
              <option key={k} value={k}>
                {CARE_KIND_SHORT[k]}
              </option>
            ))}
          </select>
          {ended ? (
            <button type="button" onClick={() => onResume(p)} style={{ fontSize: 11, padding: '1px 7px' }}>
              다시 진행
            </button>
          ) : (
            <button type="button" onClick={() => onEnd(p)} style={{ fontSize: 11, padding: '1px 7px' }}>
              종료
            </button>
          )}
          <button type="button" onClick={() => onDelete(p)} style={{ fontSize: 11, padding: '1px 7px', color: '#b3261e' }}>
            삭제
          </button>
        </div>

        <div style={{ display: 'flex', gap: '2px 14px', flexWrap: 'wrap', alignItems: 'center', marginTop: 3 }}>
          {p.kind === 'diet' && (
            <>
              <Stat label="약 소진">{programEnd ? `${koDate(programEnd)} (D-${Math.max(0, diffDaysKst(today, programEnd))})` : '-'}</Stat>
              {!program && <span className="muted-text" style={{ fontSize: 11 }}>비급여에 디톡스 시작일을 등록하면 단계가 연결돼요</span>}
            </>
          )}
          {p.kind === 'herb' && (
            <>
              <Stat label="복용">
                {herb ? herbCareStatus(herb) : '-'}
                {herb?.pickupMissing && <span className="muted-text" style={{ fontSize: 10, fontWeight: 400 }}> (수령일 미입력)</span>}
              </Stat>
              <Stat label="결제">{balance ? `${balance.totalDays}일` : '-'}</Stat>
              <Stat label="처방">{balance ? `${balance.usedDays}일` : '-'}</Stat>
              <Stat label="잔여" warn={!!balance && balance.remainingDays <= 14}>
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
              '없음'
            )}
          </Stat>
          <span style={{ whiteSpace: 'nowrap' }}>
            <span className="muted-text" style={{ fontSize: 11 }} title="정하면 그날 오늘 연락할 분에 떠요">
              다음 해피콜{' '}
            </span>
            <input
              type="date"
              className="input-field"
              value={p.nextCallDate ?? ''}
              disabled={ended}
              onChange={(e) => void onPatch(p, { nextCallDate: e.target.value })}
              style={{ fontSize: 12, padding: '0 3px', width: 118, height: 22 }}
              aria-label={`${p.patientName} 다음 해피콜 날짜`}
            />
            {p.nextCallDate && !ended && (
              <button type="button" onClick={() => void onPatch(p, { nextCallDate: '' })} title="날짜 지우기" style={{ fontSize: 10, padding: '0 4px', marginLeft: 3 }}>
                ✕
              </button>
            )}
            {dueNow && !ended && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-error)', marginLeft: 4 }}>
                {p.nextCallDate === today ? '오늘!' : `${diffDaysKst(p.nextCallDate as string, today)}일 밀림`}
              </span>
            )}
            {!p.nextCallDate && desk.nextCallDate && (
              <span className="muted-text" style={{ fontSize: 10, marginLeft: 4 }}>(데스크 {koDate(desk.nextCallDate)})</span>
            )}
          </span>
          {!ended && p.kind === 'herb' && (
            <>
              {p.packages.map((k) => (
                <span key={k.id} className="muted-text" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                  📦{k.totalDays}일·{koDate(k.startDate)}{k.manual ? '(직접)' : ''}
                  {k.manual && (
                    <button type="button" onClick={() => void removePackage(k.id)} title="지우기" style={{ fontSize: 10, padding: '0 3px', marginLeft: 2 }}>
                      ✕
                    </button>
                  )}
                </span>
              ))}
              <button type="button" onClick={() => setPkgOpen((v) => !v)} style={{ fontSize: 10, padding: '0 6px' }}>
                {pkgOpen ? '닫기' : p.packages.length > 0 ? '+ 결제' : '+ 결제 일수'}
              </button>
            </>
          )}
        </div>

        {!ended && p.kind === 'herb' && pkgOpen && (
          <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
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
          </div>
        )}
      </div>

      <div style={{ flex: '0 1 300px', minWidth: 220, position: 'relative' }}>
        <textarea
          className="input-field"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          onFocus={() => setMemoFocus(true)}
          onBlur={() => {
            setMemoFocus(false);
            void saveMemo();
          }}
          placeholder="메모 — 중점적으로 볼 것 · 저번 상담 내용"
          aria-label={`${p.patientName} 메모`}
          // 평소에는 두 줄 높이로 줄여 두고, 눌러서 쓸 때만 펼친다(환자가 쌓여도 한 화면에 많이 보이게).
          style={{ width: '100%', height: memoFocus ? 120 : 42, fontSize: 12, lineHeight: 1.4, resize: 'vertical', transition: 'height 0.12s' }}
        />
        {saved && <span style={{ position: 'absolute', right: 6, top: 2, fontSize: 10, color: 'var(--color-green)' }}>✓ 저장</span>}
      </div>
    </div>
  );
}

// 케어 보드의 환자 목록 — 한약·린다이어트·특수한약(공진단·경옥고 등)으로 나뉜 구역에서 원장이 환자를 추가·삭제하고, 다음 해피콜 날짜와 메모를 관리한다
// (원장 요청, 2026-10-23). 한약·공진단·경옥고·린다이어트를 결제하면 자동으로 올라오고, 직접 추가할 때는 종류를 골라 그 구역으로 넣는다.
export function CarePatients({ reloadKey, onCallsChanged }: { reloadKey: number; onCallsChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const today = todayKst();
  const [patients, setPatients] = useState<CarePatientStatus[]>([]);
  const [known, setKnown] = useState<KnownHerbPatient[]>([]);
  const [kind, setKind] = useState<CareKind>('herb');
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
      // 린다이어트 환자는 비급여에서 만든 프로그램과 이름·차트번호로 연결해 단계를 보여 준다.
      const programs = all.some((p) => p.kind === 'diet') ? await listDietPrograms(supabase).catch(() => []) : [];
      setPatients(await loadCarePatientStatus(supabase, all, today, programs));
      setError('');
    } catch {
      setError('등록한 환자를 불러오지 못했어요. (케어 보드 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    } finally {
      setLoading(false);
    }
  }, [supabase, today]);

  useEffect(() => {
    void reload();
  }, [reload, reloadKey]);

  // 이름을 칠 때 후보 — 고른 종류에 맞는 환자(한약: 처방전 환자, 린다이어트·특수한약: 그 결제를 한 환자)
  useEffect(() => {
    const load = kind === 'herb' ? listKnownHerbCompoundingPatients(supabase, 3000) : listKnownPurchasePatients(supabase, kind === 'diet' ? 'diet' : 'special_herb');
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
      setError('등록하지 못했어요. 잠시 뒤 다시 시도해 주세요. (특수한약 종류를 쓰려면 케어 보드 SQL을 먼저 실행해야 해요)');
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

  async function changeKind(p: CarePatientStatus, next: CareKind) {
    if (next === p.kind) return;
    try {
      await updateCarePatient(supabase, p.id, { kind: next });
      await reload();
      onCallsChanged();
    } catch {
      setError('종류를 바꾸지 못했어요. (특수한약 종류를 쓰려면 케어 보드 SQL을 먼저 실행해야 해요)');
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

  async function remove(p: CarePatientStatus) {
    if (!(await confirmDialog(`${p.patientName}님을 케어 보드에서 삭제할까요? (메모와 해피콜 날짜도 함께 사라지고 되돌릴 수 없어요. 나중에 다시 보려면 "종료"를 쓰세요)`, { confirmLabel: '삭제' }))) return;
    try {
      await deleteCarePatient(supabase, p.id);
      setPatients((prev) => prev.filter((x) => x.id !== p.id));
      onCallsChanged();
    } catch {
      setError('삭제하지 못했어요.');
    }
  }

  const cardProps = { today, onPatch: patch, onEnd: end, onResume: resume, onDelete: remove, onKind: changeKind, onPackagesChanged: reload };
  const ended = patients.filter((p) => p.status === 'ended');

  return (
    <div>
      <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>👥 환자 추가</h2>
      <p className="muted-text" style={{ margin: '0 0 8px', fontSize: 12 }}>
        한약·공진단·경옥고·린다이어트를 결제하면 자동으로 올라와요. 직접 추가할 때는 종류를 고르면 그 구역으로 들어가요(종류는 카드에서도 바꿀 수 있어요). 이름을 치면 그 종류로 결제·처방한 환자가 후보로 떠요.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={{ fontSize: 12 }}>
          종류
          <select value={kind} onChange={(e) => setKind(e.target.value as CareKind)} style={{ display: 'block', fontSize: 13, padding: 4 }}>
            {CARE_KINDS.map((k) => (
              <option key={k} value={k}>
                {CARE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
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
          {adding ? '추가 중…' : '추가'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted-text">불러오는 중…</p>}

      {CARE_KINDS.map((k) => {
        const list = patients.filter((p) => p.status === 'active' && p.kind === k);
        return (
          <div key={k}>
            <h2 style={{ fontSize: 17, margin: '18px 0 8px' }}>
              {KIND_EMOJI[k]} {CARE_KIND_SHORT[k]} 환자 ({list.length}명)
              {k === 'herb' && (
                <Link href="/herb-packages" style={{ marginLeft: 10, fontSize: 12, fontWeight: 400, textDecoration: 'underline', color: 'var(--color-muted)' }}>
                  한약 패키지 현황
                </Link>
              )}
            </h2>
            {!loading && !error && list.length === 0 && <p className="muted-text" style={{ margin: '0 0 6px', fontSize: 13 }}>등록한 환자가 없어요.</p>}
            {list.map((p) => (
              <PatientCard key={p.id} p={p} {...cardProps} />
            ))}
          </div>
        );
      })}

      {ended.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button type="button" onClick={() => setShowEnded((v) => !v)} style={{ fontSize: 13, background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--color-muted)', cursor: 'pointer' }}>
            {showEnded ? '▾' : '▸'} 종료된 환자 {ended.length}명
          </button>
          {showEnded && ended.map((p) => <PatientCard key={p.id} p={p} {...cardProps} />)}
        </div>
      )}
    </div>
  );
}
