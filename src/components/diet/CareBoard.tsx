'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { OWNER_MESSAGE_LABEL, phaseLabel, TRACK_LABEL, type DietProgram, type DueMessage } from '@/lib/dietProgram';
import { fillScript, koDate, OWNER_SCRIPTS, scriptValues } from '@/lib/dietScripts';
import { groupTodayContacts, NEXT_CALL_PRESETS, type TodayContact } from '@/lib/careToday';
import { addDaysKst, todayKst } from '@/lib/kst';
import { createClient } from '@/lib/supabase/client';
import { loadOwnerDue, recordOwnerSend } from '@/lib/supabase/dietPrograms';
import { listCareDue, updateCarePatient, type CarePatient } from '@/lib/supabase/herbCare';
import { currentStaff } from '@/lib/supabase/herbQueue';
import { BADGES_CHANGED_EVENT } from '@/lib/sidebarBadges';
import { CarePatients } from './CarePatients';

// 왼쪽 메뉴의 숫자를 바로 다시 읽게 알린다.
function notifyBadgesChanged() {
  window.dispatchEvent(new Event(BADGES_CHANGED_EVENT));
}

const smallButton = { fontSize: 12, padding: '3px 10px', whiteSpace: 'nowrap' as const };

// 카톡 보낼 차례 한 건 — 문구가 바로 보이고, 버튼은 맨 오른쪽에 모은다.
function MessageRow({ program, item, doctorName, onDone }: { program: DietProgram; item: DueMessage; doctorName: string; onDone: (item: DueMessage, action: 'sent' | 'skipped') => Promise<void> }) {
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'start', marginTop: 6 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-teal-deep)', marginBottom: 2 }}>
          💬 {OWNER_MESSAGE_LABEL[item.code]} 카톡
          <span className="muted-text" style={{ fontWeight: 400 }}>
            {' '}· {TRACK_LABEL[program.track]} · {phaseLabel(program, todayKst())}
            {program.phone ? ` · ${program.phone}` : ''}
          </span>
          {item.overdueDays > 0 && <span style={{ color: 'var(--color-error)' }}> · {item.overdueDays}일 지남</span>}
        </div>
        <textarea className="input-field" value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(8, Math.max(2, text.split('\n').length))} style={{ width: '100%', fontSize: 13 }} />
        {unresolved.length > 0 && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-error)' }}>직접 채울 곳이 있어요: {[...new Set(unresolved)].join(' ')}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button type="button" onClick={copy} style={smallButton}>
          {copied ? '✓ 복사했어요' : '문구 복사'}
        </button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => finish('sent')} style={smallButton}>
          카톡 보냄
        </button>
        <button type="button" disabled={busy} onClick={() => finish('skipped')} style={smallButton}>
          건너뜀
        </button>
      </div>
    </div>
  );
}

const careLabel = (p: CarePatient) => (p.kind === 'diet' ? '🥗 린다이어트' : p.kind === 'special' ? '💎 특수한약' : '🌿 한약');

// 해피콜을 마치면 다음 해피콜 날짜를 바로 고른다(빠른 선택·날짜 직접 선택·정하지 않음).
function NextCallPicker({ today, busy, onPick, onCancel }: { today: string; busy: boolean; onPick: (date: string) => void; onCancel: () => void }) {
  const [date, setDate] = useState('');
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 6, padding: '6px 8px', background: 'var(--color-surface-2)', borderRadius: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700 }}>다음 해피콜은 언제?</span>
      {NEXT_CALL_PRESETS.map((p) => (
        <button key={p.days} type="button" disabled={busy} onClick={() => onPick(addDaysKst(today, p.days))} style={smallButton}>
          {p.label}
        </button>
      ))}
      <input type="date" className="input-field" value={date} min={addDaysKst(today, 1)} onChange={(e) => setDate(e.target.value)} style={{ fontSize: 12, padding: '2px 6px' }} />
      <button type="button" className="btn-primary" disabled={busy || !date} onClick={() => onPick(date)} style={smallButton}>
        이 날짜로
      </button>
      <button type="button" disabled={busy} onClick={() => onPick('')} style={smallButton}>
        정하지 않음
      </button>
      <button type="button" disabled={busy} onClick={onCancel} style={{ ...smallButton, marginLeft: 'auto' }}>
        취소
      </button>
    </div>
  );
}

// 오늘 연락할 한 사람 — 한 칸에 해피콜(메모)과 카톡 문구를 함께 보여 주고, 버튼은 맨 오른쪽에 둔다.
function ContactCard({
  contact,
  today,
  doctorName,
  onCareDone,
  onMessageDone,
}: {
  contact: TodayContact;
  today: string;
  doctorName: string;
  onCareDone: (p: CarePatient, action: 'tomorrow' | { next: string }) => Promise<void>;
  onMessageDone: (item: DueMessage, action: 'sent' | 'skipped') => Promise<void>;
}) {
  const care = contact.care;
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);

  async function finish(action: 'tomorrow' | { next: string }) {
    if (!care) return;
    setBusy(true);
    try {
      await onCareDone(care, action);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: '8px 12px', marginBottom: 8, borderLeft: '4px solid var(--color-teal)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>{contact.patientName}</span>
            {care && <span style={{ fontWeight: 700, color: 'var(--color-teal-deep)', fontSize: 13 }}>{careLabel(care)} 해피콜</span>}
            {contact.chartNo && <span className="muted-text" style={{ fontSize: 12 }}>차트 {contact.chartNo}</span>}
            {care && contact.overdueDays > 0 && <span style={{ fontSize: 12, color: 'var(--color-error)', fontWeight: 700 }}>{contact.overdueDays}일 지남</span>}
            {care?.lastCallDate && <span className="muted-text" style={{ fontSize: 12 }}>마지막 해피콜 {koDate(care.lastCallDate)}</span>}
          </div>
          {care && (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.4, marginTop: 3 }}>
              {care.memo || <span className="muted-text">메모가 없어요. 아래 환자 카드에서 중점 사항을 적어 두세요.</span>}
            </div>
          )}
        </div>
        {care && !choosing && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => setChoosing(true)} style={smallButton}>
              해피콜 완료
            </button>
            <button type="button" disabled={busy} onClick={() => finish('tomorrow')} style={smallButton}>
              내일로 미루기
            </button>
          </div>
        )}
      </div>
      {care && choosing && (
        <NextCallPicker
          today={today}
          busy={busy}
          onCancel={() => setChoosing(false)}
          onPick={(date) => void finish({ next: date })}
        />
      )}
      {contact.messages.map(({ item, program }) => (
        <MessageRow key={`${item.programId}|${item.code}|${item.dueDate}`} program={program} item={item} doctorName={doctorName} onDone={onMessageDone} />
      ))}
    </div>
  );
}

// 원장 전용 케어 보드 — 오늘 원장이 연락할 환자(해피콜·카톡 문구)와 한약·린다이어트·특수한약 환자를 한 화면에서 본다(원장 요청, 2026-10-20).
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

  async function onMessageDone(item: DueMessage, action: 'sent' | 'skipped') {
    await recordOwnerSend(supabase, { programId: item.programId, code: item.code, dueDate: item.dueDate }, action, staffId, today);
    setDue((prev) => prev.filter((d) => !(d.programId === item.programId && d.code === item.code && d.dueDate === item.dueDate)));
    notifyBadgesChanged(); // 왼쪽 메뉴의 "오늘 연락할 환자" 숫자도 바로 줄인다
    if (action === 'sent') setPrograms((prev) => prev.map((p) => (p.id === item.programId ? { ...p, lastDoctorContactDate: today } : p)));
  }

  // 해피콜 완료는 마지막 해피콜 날짜를 오늘로 남기고, 방금 고른 날짜를 다음 해피콜로 정한다(고르지 않으면 비운다).
  async function onCareDone(p: CarePatient, action: 'tomorrow' | { next: string }) {
    if (action === 'tomorrow') await updateCarePatient(supabase, p.id, { nextCallDate: addDaysKst(today, 1) });
    else await updateCarePatient(supabase, p.id, { lastCallDate: today, nextCallDate: action.next });
    setCareDue((prev) => prev.filter((x) => x.id !== p.id));
    setCareVersion((v) => v + 1);
    notifyBadgesChanged(); // 왼쪽 메뉴의 "오늘 연락할 환자" 숫자도 바로 줄인다
  }

  const contacts = useMemo(() => groupTodayContacts(careDue, due, programs, today), [careDue, due, programs, today]);

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>케어 보드</h1>
      <p className="muted-text" style={{ margin: '0 0 14px', fontSize: 13 }}>원장님만 보이는 화면이에요. <Link href="/non-covered-patients" style={{ textDecoration: 'underline' }}>비급여 현황</Link>에서 한약·공진단·경옥고·린다이어트를 결제하면 환자가 자동으로 올라와요(린다이어트는 디톡스 시작일·주수를 적으면 디톡스 3일은 데스크 해피콜, 다이어트환 시작일은 여기서 원장님이 연락). 기록이 끊긴 분이나 이상 증상은 <Link href="/leandiet-report" style={{ textDecoration: 'underline' }}>린다이어트 기록 체크</Link>에서 확인하세요.</p>

      <h2 style={{ fontSize: 17, margin: '0 0 8px' }}>📨 오늘 연락할 분 {contacts.length > 0 && <span style={{ color: 'var(--color-error)' }}>{contacts.length}명</span>}</h2>
      {loading && <p className="muted-text">불러오는 중…</p>}
      {dietError && <p className="error-text">{dietError}</p>}
      {!loading && !dietError && contacts.length === 0 && <p className="muted-text" style={{ marginBottom: 16 }}>오늘 연락할 분이 없어요 👍</p>}
      {contacts.map((c) => (
        <ContactCard key={c.key} contact={c} today={today} doctorName={doctorName} onCareDone={onCareDone} onMessageDone={onMessageDone} />
      ))}

      <CarePatients
        reloadKey={careVersion}
        onCallsChanged={() => {
          void load();
          notifyBadgesChanged(); // 날짜·종료를 바꾸면 왼쪽 메뉴 숫자도 다시 읽는다
        }}
      />
    </div>
  );
}
