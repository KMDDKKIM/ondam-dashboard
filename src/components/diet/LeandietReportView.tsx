'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { discomfortTexts, EXCLUDE_REASONS, groupReportPatients, isReportFresh, partitionPatients, SENT_HIDE_DAYS, type LeanPatient } from '@/lib/leandietReport';
import { addDaysKst, todayKst } from '@/lib/kst';
import { createClient } from '@/lib/supabase/client';
import { getManualEntryStates } from '@/lib/supabase/happyCallQueue';
import { currentStaff } from '@/lib/supabase/herbQueue';
import {
  excludePatient,
  listExcluded,
  loadFollowups,
  loadLatestReport,
  restoreExcluded,
  sendToDesk,
  sendToOwnerBoard,
  type ExcludedPatient,
  type Followup,
  type StoredReport,
} from '@/lib/supabase/leandietReports';

const smallButton = { fontSize: 12, padding: '3px 10px' } as const;

function koTime(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

const shortDate = (date: string) => date.slice(5).replace('-', '/');

function PatientRow({
  p,
  busy,
  onSend,
  onExclude,
  showDiscomfort,
}: {
  p: LeanPatient;
  busy: boolean;
  onSend: (p: LeanPatient, target: 'desk' | 'owner') => void;
  onExclude: (p: LeanPatient, reason: string) => void;
  showDiscomfort?: boolean;
}) {
  const [excluding, setExcluding] = useState(false);
  const symptoms = showDiscomfort ? discomfortTexts(p) : [];
  const latestBad = p.conditions.find((c) => c.bad)?.date;
  return (
    <div className="card" style={{ padding: '8px 12px', marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>{p.name}</span>
        <span className="muted-text" style={{ fontSize: 12 }}>
          {p.week != null ? `${p.week}주차` : '주차 미상'}
          {p.doctor ? ` · ${p.doctor}` : ''}
          {p.phone ? ` · ${p.phone}` : ''}
        </span>
        <span className="muted-text" style={{ fontSize: 12 }}>
          식단 어제 {p.dietYesterday}끼 · 그제 {p.dietDayBefore}끼 · 체중 {p.weightYesterday ? '기록' : '없음'} · 복약 {p.medYesterday}회
          {p.lastDietDate ? ` · 마지막 식단 ${shortDate(p.lastDietDate)}` : ''}
        </span>
        {p.nutritionTags.map((t) => (
          <span key={t} style={{ fontSize: 11, background: 'var(--color-surface-2)', borderRadius: 6, padding: '1px 6px' }}>{t}</span>
        ))}
        {p.chartUrl && (
          <a href={p.chartUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, textDecoration: 'underline' }}>차트 열기</a>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" disabled={busy} onClick={() => onSend(p, 'desk')} style={smallButton}>직원 해피콜로 보내기</button>
          <button type="button" disabled={busy} onClick={() => onSend(p, 'owner')} style={smallButton}>원장 케어 보드로 보내기</button>
          <button type="button" disabled={busy} onClick={() => setExcluding((v) => !v)} title="더 이상 연락하지 않을 환자는 제외해 두면 다음 리포트부터 나오지 않아요" style={smallButton}>
            제외
          </button>
        </span>
      </div>
      {symptoms.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-error)' }}>
          {latestBad ? `${shortDate(latestBad)} · ` : ''}
          {symptoms.join(' / ')}
        </div>
      )}
      {excluding && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6, padding: '6px 8px', background: 'var(--color-surface-2)', borderRadius: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>더 이상 연락 안 하는 이유는?</span>
          {EXCLUDE_REASONS.map((reason) => (
            <button key={reason} type="button" disabled={busy} onClick={() => onExclude(p, reason)} style={smallButton}>
              {reason}
            </button>
          ))}
          <button type="button" onClick={() => setExcluding(false)} style={{ ...smallButton, marginLeft: 'auto' }}>취소</button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children, count }: { title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>
        {title} <span className="muted-text" style={{ fontSize: 13, fontWeight: 400 }}>{count}명</span>
      </h2>
      {children}
    </section>
  );
}

// 접었다 펴는 구역(기록 잘 하는 환자·보낸 환자·제외한 환자).
function Collapsible({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <section style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>
        {title} <span className="muted-text" style={{ fontSize: 13, fontWeight: 400 }}>{count}명</span>{' '}
        <button type="button" onClick={() => setOpen((v) => !v)} style={smallButton}>{open ? '접기' : '펼치기'}</button>
      </h2>
      {open && children}
    </section>
  );
}

// 린다이어트 기록 체크 — 아침 리포트를 보고 연락이 필요한 환자를 직원 해피콜 / 원장 케어 보드로 보낸다(원장 요청, 2026-10-24).
// 보낸 환자는 목록에서 빠지고(보낸 환자 구역으로 이동), 연락이 필요 없는 환자는 "제외"로 다음 리포트부터 나오지 않게 한다(2026-10-27).
export function LeandietReportView() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayKst();
  const [report, setReport] = useState<StoredReport | null>(null);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [excluded, setExcluded] = useState<ExcludedPatient[]>([]);
  const [closedEntries, setClosedEntries] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const staff = await currentStaff(supabase);
      setMe(staff.id);
      const r = await loadLatestReport(supabase);
      setReport(r);
      // 제외 목록은 따로 읽는다 — 제외 표를 아직 안 만들었어도 리포트는 보이게.
      let ex: ExcludedPatient[] = [];
      let exFailed = false;
      try {
        ex = await listExcluded(supabase);
      } catch {
        exFailed = true;
      }
      setExcluded(ex);
      if (r) {
        const f = await loadFollowups(supabase, addDaysKst(r.reportDate, -14));
        setFollowups(f);
        const states = await getManualEntryStates(supabase, f.flatMap((x) => (x.entryId ? [x.entryId] : [])));
        setClosedEntries(new Set(states.filter((s) => s.closed).map((s) => s.id)));
      }
      setError(exFailed ? '제외 목록을 불러오지 못했어요. (제외용 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)' : '');
    } catch {
      setError('불러오지 못했어요. (린다이어트 리포트 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSend(p: LeanPatient, target: 'desk' | 'owner') {
    if (!report) return;
    setBusyId(p.leanPatientId);
    try {
      if (target === 'desk') await sendToDesk(supabase, p, report.reportDate, me);
      else await sendToOwnerBoard(p, report.reportDate);
      await load();
    } catch {
      setError('보내지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setBusyId(null);
    }
  }

  async function onExclude(p: LeanPatient, reason: string) {
    setBusyId(p.leanPatientId);
    try {
      await excludePatient(supabase, p, reason, me);
      await load();
    } catch {
      setError('제외하지 못했어요. (제외용 SQL을 아직 실행하지 않았다면 먼저 실행해 주세요)');
    } finally {
      setBusyId(null);
    }
  }

  async function onRestore(id: string) {
    setBusyId(id);
    try {
      await restoreExcluded(supabase, id);
      await load();
    } catch {
      setError('되돌리지 못했어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setBusyId(null);
    }
  }

  const parts = useMemo(() => {
    if (!report) return null;
    const excludedIds = new Set(excluded.map((e) => e.leanPatientId));
    const { active, sent } = partitionPatients(report.patients, followups, excludedIds, report.reportDate, addDaysKst);
    return { groups: groupReportPatients(active), sent };
  }, [report, followups, excluded]);

  const deskClosedOf = (id: string, reportDate: string) =>
    followups.some((f) => f.leanPatientId === id && f.reportDate === reportDate && f.target === 'desk' && f.entryId != null && closedEntries.has(f.entryId));

  const renderRows = (list: LeanPatient[], showDiscomfort = false) =>
    list.map((p) => <PatientRow key={p.leanPatientId} p={p} busy={busyId === p.leanPatientId} onSend={onSend} onExclude={onExclude} showDiscomfort={showDiscomfort} />);

  const fresh = report ? isReportFresh(report.reportDate, today) : false;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>린다이어트 기록 체크</h1>
      <p className="muted-text" style={{ margin: '0 0 12px', fontSize: 13 }}>
        매일 아침 린다이어트 차트의 식단·체중·복약 기록을 점검한 결과예요. 연락이 필요한 환자는 오른쪽 버튼으로 직원 해피콜 목록이나 원장 케어 보드로 보내면 이 목록에서 빠지고(아래 &quot;보낸 환자&quot;로 이동, {SENT_HIDE_DAYS}일 뒤에도 조건에 맞으면 다시 나와요),
        기록을 안 하기로 했거나 종료해서 더 이상 연락하지 않을 환자는 <b>제외</b>를 눌러 두면 다음 리포트부터 나오지 않아요.
      </p>
      {loading && <p className="muted-text">불러오는 중…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && !report && <p className="muted-text">아직 받은 리포트가 없어요. 원장님 PC의 아침 작업이 처음 보내 오면 여기에 나타나요.</p>}

      {report && parts && (
        <>
          <div className="card" style={{ padding: '10px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 800 }}>기준일 {report.baseDate ?? report.reportDate}</span>
              <span>전체 <b>{report.summary.total}</b></span>
              <span style={{ color: 'var(--color-error)' }}>🔴 불편 <b>{report.summary.discomfort}</b></span>
              <span>✅ 기록중 <b>{report.summary.recording}</b></span>
              <span>🟡 끊김 <b>{report.summary.partial}</b></span>
              <span>⚪ 없음 <b>{report.summary.noRecord}</b></span>
              <span className="muted-text" style={{ fontSize: 12 }}>마지막 수신 {koTime(report.receivedAt)}</span>
            </div>
            {!fresh && (
              <p style={{ margin: '6px 0 0', color: 'var(--color-error)', fontWeight: 700, fontSize: 13 }}>
                오늘 리포트 미수신 (원장님 PC가 켜져 있고 린다이어트 차트에 로그인돼 있는지 확인해 주세요) · 지금 화면은 {report.reportDate} 리포트예요.
              </p>
            )}
            {report.criteria && <p className="muted-text" style={{ margin: '6px 0 0', fontSize: 12 }}>판정 기준: {report.criteria}</p>}
          </div>

          <Section title="🔴 불편 사항" count={parts.groups.discomfort.length}>{renderRows(parts.groups.discomfort, true)}</Section>
          <Section title="🟡 기록 끊긴 환자" count={parts.groups.partial.length}>{renderRows(parts.groups.partial)}</Section>
          <Section title="⚪ 기록 없음 · 4주차 이내" count={parts.groups.none.early.length}>{renderRows(parts.groups.none.early)}</Section>
          <Section title="⚪ 기록 없음 · 5~12주차" count={parts.groups.none.mid.length}>{renderRows(parts.groups.none.mid)}</Section>
          <Section title="⚪ 기록 없음 · 13주차 이상" count={parts.groups.none.late.length}>{renderRows(parts.groups.none.late)}</Section>
          <Collapsible title="✅ 기록 잘 하는 환자" count={parts.groups.recording.length}>{renderRows(parts.groups.recording)}</Collapsible>

          <Collapsible title="📤 보낸 환자" count={parts.sent.length}>
            {parts.sent.map(({ patient, targets, sentDate }) => (
              <div key={patient.leanPatientId} className="card" style={{ padding: '6px 12px', marginBottom: 6, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700 }}>{patient.name}</span>
                <span className="muted-text" style={{ fontSize: 12 }}>{shortDate(sentDate)}에 보냄</span>
                {targets.includes('desk') && (
                  <span style={{ fontSize: 12 }}>☎️ 직원 해피콜 {deskClosedOf(patient.leanPatientId, sentDate) ? '완료' : '대기'}</span>
                )}
                {targets.includes('owner') && <span style={{ fontSize: 12 }}>💌 케어 보드</span>}
              </div>
            ))}
          </Collapsible>
        </>
      )}

      <Collapsible title="🚫 제외한 환자" count={excluded.length}>
        {excluded.map((e) => (
          <div key={e.leanPatientId} className="card" style={{ padding: '6px 12px', marginBottom: 6, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700 }}>{e.patientName}</span>
            <span className="muted-text" style={{ fontSize: 12 }}>{e.reason} · {koTime(e.createdAt).split(' ')[0]} 제외</span>
            <button type="button" disabled={busyId === e.leanPatientId} onClick={() => onRestore(e.leanPatientId)} style={{ ...smallButton, marginLeft: 'auto' }}>
              다시 목록에 나오게
            </button>
          </div>
        ))}
      </Collapsible>
    </div>
  );
}
