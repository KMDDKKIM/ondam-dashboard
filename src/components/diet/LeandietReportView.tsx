'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { discomfortTexts, groupReportPatients, isReportFresh, type LeanPatient } from '@/lib/leandietReport';
import { addDaysKst, todayKst } from '@/lib/kst';
import { createClient } from '@/lib/supabase/client';
import { getManualEntryStates } from '@/lib/supabase/happyCallQueue';
import { currentStaff } from '@/lib/supabase/herbQueue';
import { loadFollowups, loadLatestReport, sendToDesk, sendToOwnerBoard, type Followup, type StoredReport } from '@/lib/supabase/leandietReports';

const smallButton = { fontSize: 12, padding: '3px 10px' } as const;

function koTime(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()} ${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}`;
}

function PatientRow({
  p,
  sent,
  deskClosed,
  busy,
  onSend,
  showDiscomfort,
}: {
  p: LeanPatient;
  sent: { desk: boolean; owner: boolean };
  deskClosed: boolean;
  busy: boolean;
  onSend: (p: LeanPatient, target: 'desk' | 'owner') => void;
  showDiscomfort?: boolean;
}) {
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
          {p.lastDietDate ? ` · 마지막 식단 ${p.lastDietDate.slice(5).replace('-', '/')}` : ''}
        </span>
        {p.nutritionTags.map((t) => (
          <span key={t} style={{ fontSize: 11, background: 'var(--color-surface-2)', borderRadius: 6, padding: '1px 6px' }}>{t}</span>
        ))}
        {p.chartUrl && (
          <a href={p.chartUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, textDecoration: 'underline' }}>차트 열기</a>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {sent.desk ? (
            <span style={{ fontSize: 12, color: deskClosed ? 'var(--color-teal-deep)' : 'var(--color-ink-2, #555)' }}>
              ☎️ 직원 해피콜 {deskClosed ? '완료' : '대기'}
            </span>
          ) : (
            <button type="button" disabled={busy} onClick={() => onSend(p, 'desk')} style={smallButton}>직원 해피콜로 보내기</button>
          )}
          {sent.owner ? (
            <span style={{ fontSize: 12 }}>💌 케어 보드에 보냄</span>
          ) : (
            <button type="button" disabled={busy} onClick={() => onSend(p, 'owner')} style={smallButton}>원장 케어 보드로 보내기</button>
          )}
        </span>
      </div>
      {symptoms.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--color-error)' }}>
          {latestBad ? `${latestBad.slice(5).replace('-', '/')} · ` : ''}
          {symptoms.join(' / ')}
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

// 린다이어트 기록 체크 — 아침 리포트를 보고 연락이 필요한 환자를 직원 해피콜 / 원장 케어 보드로 보낸다(원장 요청, 2026-10-24).
export function LeandietReportView() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayKst();
  const [report, setReport] = useState<StoredReport | null>(null);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [closedEntries, setClosedEntries] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [onlyUnsent, setOnlyUnsent] = useState(false);
  const [showRecording, setShowRecording] = useState(false);

  const load = useCallback(async () => {
    try {
      const staff = await currentStaff(supabase);
      setMe(staff.id);
      const r = await loadLatestReport(supabase);
      setReport(r);
      if (r) {
        const f = await loadFollowups(supabase, addDaysKst(r.reportDate, -14));
        setFollowups(f);
        const states = await getManualEntryStates(supabase, f.flatMap((x) => (x.entryId ? [x.entryId] : [])));
        setClosedEntries(new Set(states.filter((s) => s.closed).map((s) => s.id)));
      }
      setError('');
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

  const sentOf = (p: LeanPatient) => {
    const mine = followups.filter((f) => f.leanPatientId === p.leanPatientId && report && f.reportDate === report.reportDate);
    return { desk: mine.some((f) => f.target === 'desk'), owner: mine.some((f) => f.target === 'owner') };
  };
  const deskClosedOf = (p: LeanPatient) =>
    followups.some((f) => f.leanPatientId === p.leanPatientId && report && f.reportDate === report.reportDate && f.target === 'desk' && f.entryId != null && closedEntries.has(f.entryId));

  const sections = useMemo(() => {
    if (!report) return null;
    const keep = (p: LeanPatient) => {
      if (!onlyUnsent) return true;
      const mine = followups.filter((f) => f.leanPatientId === p.leanPatientId && f.reportDate === report.reportDate);
      return mine.length === 0;
    };
    const g = groupReportPatients(report.patients);
    return {
      discomfort: g.discomfort.filter(keep),
      partial: g.partial.filter(keep),
      early: g.none.early.filter(keep),
      mid: g.none.mid.filter(keep),
      late: g.none.late.filter(keep),
      recording: g.recording.filter(keep),
    };
  }, [report, followups, onlyUnsent]);

  const renderRows = (list: LeanPatient[], showDiscomfort = false) =>
    list.map((p) => (
      <PatientRow
        key={p.leanPatientId}
        p={p}
        sent={sentOf(p)}
        deskClosed={deskClosedOf(p)}
        busy={busyId === p.leanPatientId}
        onSend={onSend}
        showDiscomfort={showDiscomfort}
      />
    ));

  const fresh = report ? isReportFresh(report.reportDate, today) : false;

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>린다이어트 기록 체크</h1>
      <p className="muted-text" style={{ margin: '0 0 12px', fontSize: 13 }}>
        매일 아침 린다이어트 차트의 식단·체중·복약 기록을 점검한 결과예요. 연락이 필요한 환자는 오른쪽 버튼으로 직원 해피콜 목록이나 원장 케어 보드로 보내세요.
      </p>
      {loading && <p className="muted-text">불러오는 중…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && !report && <p className="muted-text">아직 받은 리포트가 없어요. 원장님 PC의 아침 작업이 처음 보내 오면 여기에 나타나요.</p>}

      {report && sections && (
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
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 8, fontSize: 13 }}>
              <input type="checkbox" checked={onlyUnsent} onChange={(e) => setOnlyUnsent(e.target.checked)} />
              아직 안 보낸 환자만 보기
            </label>
          </div>

          <Section title="🔴 불편 사항" count={sections.discomfort.length}>{renderRows(sections.discomfort, true)}</Section>
          <Section title="🟡 기록 끊긴 환자" count={sections.partial.length}>{renderRows(sections.partial)}</Section>
          <Section title="⚪ 기록 없음 · 4주차 이내" count={sections.early.length}>{renderRows(sections.early)}</Section>
          <Section title="⚪ 기록 없음 · 5~12주차" count={sections.mid.length}>{renderRows(sections.mid)}</Section>
          <Section title="⚪ 기록 없음 · 13주차 이상" count={sections.late.length}>{renderRows(sections.late)}</Section>
          {sections.recording.length > 0 && (
            <section style={{ marginBottom: 18 }}>
              <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>
                ✅ 기록 잘 하는 환자 <span className="muted-text" style={{ fontSize: 13, fontWeight: 400 }}>{sections.recording.length}명</span>{' '}
                <button type="button" onClick={() => setShowRecording((v) => !v)} style={smallButton}>{showRecording ? '접기' : '펼치기'}</button>
              </h2>
              {showRecording && renderRows(sections.recording)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
