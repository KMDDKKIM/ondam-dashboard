// 린다이어트 프로그램 카드와 해피콜 일정 계산(순수 로직) — 원장 요청 2026-10-20.
// 기준은 온유한의원 사례의 대면/비대면 해피콜 문서다. 원장이 직접 보내는 카톡(케어 보드)과 데스크(코디)가 거는 해피콜(해피콜 목록)을
// 구분해서 각각 계산한다. 기록이 3일 끊긴 환자 연락은 특수한 경우라 자동화하지 않는다(린다이어트 차트 브리핑에서 확인).
// 화면/DB 코드는 supabase/dietPrograms.ts.

import { CLINIC_HOLIDAYS } from './clinicHolidays';
import { addDaysKst, diffDaysKst, weekdayKo } from './kst';

export type DietTrack = 'visit' | 'remote';
export type DietStatus = 'active' | 'ended';

export interface DietProgram {
  id: string;
  patientName: string;
  chartNo: string;
  phone: string;
  track: DietTrack;
  firstDate: string | null;
  weeks: number | null;
  paidAt: string | null;
  shippedAt: string | null;
  detoxStartDate: string | null;
  detoxDays: number;
  medicineEndDate: string | null;
  revisitDate: string | null;
  lastDoctorContactDate: string | null;
  status: DietStatus;
  endedAt: string | null;
  memo: string;
}

export const TRACK_LABEL: Record<DietTrack, string> = { visit: '대면', remote: '비대면' };

/** 다이어트환을 시작하는 날 = 디톡스 시작일 + 디톡스 일수. 디톡스 시작일을 모르면 null. */
export function dietPillStartDate(p: Pick<DietProgram, 'detoxStartDate' | 'detoxDays'>): string | null {
  return p.detoxStartDate ? addDaysKst(p.detoxStartDate, p.detoxDays) : null;
}

/** 약 소진 예정일 — 직접 적은 값이 우선이고, 없으면 디톡스 시작일 + 주수 × 7일 − 1일. */
export function medicineEndDate(p: Pick<DietProgram, 'medicineEndDate' | 'detoxStartDate' | 'weeks'>): string | null {
  if (p.medicineEndDate) return p.medicineEndDate;
  if (p.detoxStartDate && p.weeks && p.weeks > 0) return addDaysKst(p.detoxStartDate, p.weeks * 7 - 1);
  return null;
}

/** 지금 어느 단계인지 한 줄로. */
export function phaseLabel(p: DietProgram, today: string): string {
  if (p.status === 'ended') return '종료';
  if (!p.detoxStartDate) return '디톡스 시작일 미정';
  if (today < p.detoxStartDate) return `디톡스 시작 D-${diffDaysKst(today, p.detoxStartDate)}`;
  const pillStart = dietPillStartDate(p) as string;
  if (today < pillStart) return `디톡스 ${diffDaysKst(p.detoxStartDate, today) + 1}일차`;
  const day = diffDaysKst(pillStart, today);
  return `다이어트환 ${Math.floor(day / 7) + 1}주차 (${day + 1}일째)`;
}

// ---- 원장 카톡 ----

export type OwnerMessageCode =
  | 'visit-revisit'   // 대8 재진 후 단계 전환 안내
  | 'remote-second'   // 비10 2차 상담 후 재처방 안내
  | 'remote-nudge'    // 비9 2차 상담이 아직 안 잡힌 비대면 환자 안부
  | 'pill-day1'       // 공3 다이어트환 시작 다음 날 안부
  | 'weekly'          // 공5 매주 월요일 문안
  | 'refill'          // 공9 약 소진 4일 전 연복 권유
  | 'holiday';        // 공10 연휴 전 공지

export const OWNER_MESSAGE_LABEL: Record<OwnerMessageCode, string> = {
  'visit-revisit': '재진 후 단계 전환 안내',
  'remote-second': '2차 상담 후 재처방 안내',
  'remote-nudge': '2차 상담 일정 확인 안부',
  'pill-day1': '다이어트환 첫날 안부',
  weekly: '월요일 문안',
  refill: '연복 권유(약 소진 임박)',
  holiday: '연휴 전 공지',
};

export interface DueMessage {
  programId: string;
  code: OwnerMessageCode;
  /** 보내기로 한 날 — 같은 환자·메시지·날짜는 한 번만 보낸다(diet_program_sends 키) */
  dueDate: string;
  /** 며칠 지났는지(0 = 오늘) */
  overdueDays: number;
}

export interface SendKey {
  programId: string;
  code: string;
  dueDate: string;
}

/** 연속한 휴진일을 한 덩어리(연휴)로 묶는다. 예: 추석 3일 → { start, end }. */
export function holidayClusters(holidays: readonly string[] = CLINIC_HOLIDAYS): { start: string; end: string }[] {
  const sorted = [...holidays].sort();
  const clusters: { start: string; end: string }[] = [];
  for (const d of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && addDaysKst(last.end, 1) === d) last.end = d;
    else clusters.push({ start: d, end: d });
  }
  return clusters;
}

interface Candidate {
  code: OwnerMessageCode;
  dueDate: string;
  /** 예정일이 지난 뒤에도 며칠 동안은 계속 보여 준다 */
  windowDays: number;
}

function candidates(p: DietProgram, today: string, holidays: readonly string[]): Candidate[] {
  const out: Candidate[] = [];
  const end = medicineEndDate(p);
  const pillStart = dietPillStartDate(p);
  const started = p.detoxStartDate != null && p.detoxStartDate <= today;
  const stillOnMedicine = end == null || end >= today;

  // 재진/2차 상담을 마친 뒤 원장 안내(대면 대8, 비대면 비10)
  if (p.revisitDate) out.push({ code: p.track === 'visit' ? 'visit-revisit' : 'remote-second', dueDate: p.revisitDate, windowDays: 3 });

  // 비9: 약 소진 10일 전이 지났는데 2차 상담이 아직 안 잡혔으면 약이 있는지 안부(비대면)
  if (p.track === 'remote' && end && !p.revisitDate) out.push({ code: 'remote-nudge', dueDate: addDaysKst(end, -9), windowDays: 5 });

  // 공3: 다이어트환 시작 다음 날
  if (pillStart) out.push({ code: 'pill-day1', dueDate: addDaysKst(pillStart, 1), windowDays: 2 });

  // 공5: 월요일마다(복용 중인 환자에게). 월요일 당일에만 보인다.
  if (started && stillOnMedicine && weekdayKo(today) === '월') out.push({ code: 'weekly', dueDate: today, windowDays: 0 });

  // 공9: 약 소진 4일 전
  if (end) out.push({ code: 'refill', dueDate: addDaysKst(end, -4), windowDays: 4 });

  // 공10: 연휴 하루 전(복용 중인 환자에게)
  if (started && stillOnMedicine) {
    for (const c of holidayClusters(holidays)) out.push({ code: 'holiday', dueDate: addDaysKst(c.start, -1), windowDays: 0 });
  }
  return out;
}

/**
 * 오늘(또는 며칠 안에 지난) 원장이 카톡을 보낼 차례인 것들. 이미 보냈거나 건너뛴 것(sends)과 종료된 환자는 뺀다.
 * 예정일이 오늘 이전이고 windowDays 안인 것만 낸다 — 오래 지난 건 더 이상 의미가 없어서 사라진다.
 */
export function ownerDueMessages(programs: DietProgram[], today: string, sends: SendKey[], holidays: readonly string[] = CLINIC_HOLIDAYS): DueMessage[] {
  const done = new Set(sends.map((s) => `${s.programId}|${s.code}|${s.dueDate}`));
  const result: DueMessage[] = [];
  for (const p of programs) {
    if (p.status !== 'active') continue;
    for (const c of candidates(p, today, holidays)) {
      const overdue = diffDaysKst(c.dueDate, today);
      if (overdue < 0 || overdue > c.windowDays) continue;
      if (done.has(`${p.id}|${c.code}|${c.dueDate}`)) continue;
      result.push({ programId: p.id, code: c.code, dueDate: c.dueDate, overdueDays: overdue });
    }
  }
  // 많이 밀린 것부터, 같으면 환자 이름순
  const name = new Map(programs.map((p) => [p.id, p.patientName]));
  return result.sort((a, b) => b.overdueDays - a.overdueDays || (name.get(a.programId) ?? '').localeCompare(name.get(b.programId) ?? '', 'ko'));
}

// ---- 데스크(코디) 해피콜 ----
// 날짜로 정해지는 것(scheduled)은 프로그램 날짜에서 계산해 해피콜 목록에 미리 만들고, 그날그날 일어나는 일(event: 진료 후·결제 확인·발송)은
// 데스크가 단추를 누를 때 오늘 날짜로 만든다.

export type DeskCallCode =
  | 'consult-done' // 대3/비4 진료·상담 후 안내(등록할 때)
  | 'paid'         // 대4/비5 결제 확인 후 리뷰·앱 안내
  | 'shipped'      // 대5/비6/대9/비11 발송 완료 송장 안내
  | 'received'     // 비7 약 수령 확인(비대면, 발송 다음 날)
  | 'detox-eve'    // 공1 디톡스 전날 복용법
  | 'pill-start'   // 공2 다이어트환 시작일 안내
  | 'monthly'      // 공6 월초 안부
  | 'reorder'      // 대6/비8 약 소진 10일 전 재진·2차 상담 예약
  | 'finish';      // 공11 종료 안내와 네이버 리뷰

export const SCHEDULED_DESK_CODES: readonly DeskCallCode[] = ['detox-eve', 'pill-start', 'monthly', 'reorder'];

/** 해피콜 목록에 적히는 문구의 앞머리 — 목록에서 린다이어트 해피콜을 알아보고 문구(스크립트)를 찾는 데 쓴다. */
export const DESK_NOTE_PREFIX = '린다이어트 · ';

export function deskCallLabel(code: DeskCallCode, track: DietTrack): string {
  switch (code) {
    case 'consult-done':
      return track === 'visit' ? '진료 후 안내(채널 추가·약 수령 방식)' : '상담 후 처방 요약·결제 링크';
    case 'paid':
      return track === 'visit' ? '결제 후 리뷰·앱 안내' : '결제 확인 후 주소 확인·리뷰·앱 안내';
    case 'shipped':
      return '발송 완료 송장 안내';
    case 'received':
      return '약 수령 확인';
    case 'detox-eve':
      return '디톡스 전날 복용법 안내';
    case 'pill-start':
      return '다이어트환 시작 컨디션·식단 안내';
    case 'monthly':
      return '월초 안부';
    case 'reorder':
      return track === 'visit' ? '재진 예약 안내(약 소진 10일 전)' : '2차 전화상담 예약(약 소진 10일 전)';
    case 'finish':
      return '종료 안내·네이버 리뷰 요청';
  }
}

export function deskCallNote(code: DeskCallCode, track: DietTrack): string {
  return DESK_NOTE_PREFIX + deskCallLabel(code, track);
}

/** 해피콜 목록의 문구로 어떤 데스크 해피콜인지 찾는다(린다이어트 해피콜이 아니거나 모르는 문구면 null). */
export function deskCodeFromNote(note: string | null | undefined): DeskCallCode | null {
  if (!note || !note.startsWith(DESK_NOTE_PREFIX)) return null;
  const label = note.slice(DESK_NOTE_PREFIX.length).trim();
  const codes: DeskCallCode[] = ['consult-done', 'paid', 'shipped', 'received', 'detox-eve', 'pill-start', 'monthly', 'reorder', 'finish'];
  for (const code of codes) {
    for (const track of ['visit', 'remote'] as DietTrack[]) if (deskCallLabel(code, track) === label) return code;
  }
  return null;
}

export interface DesiredDeskCall {
  code: DeskCallCode;
  callDate: string;
}

/** 날짜로 정해지는 데스크 해피콜 — 디톡스 전날, 다이어트환 시작일, 월초 안부(복용 기간 중 매월 1일), 약 소진 10일 전. */
export function scheduledDeskCalls(p: DietProgram): DesiredDeskCall[] {
  const out: DesiredDeskCall[] = [];
  const end = medicineEndDate(p);
  const pillStart = dietPillStartDate(p);
  if (p.detoxStartDate) out.push({ code: 'detox-eve', callDate: addDaysKst(p.detoxStartDate, -1) });
  if (pillStart) out.push({ code: 'pill-start', callDate: pillStart });
  if (pillStart && end) {
    // 다이어트환 시작 다음 달부터 약 소진 예정일까지의 매월 1일
    let month = pillStart.slice(0, 7);
    for (let i = 0; i < 36; i++) {
      const [y, m] = month.split('-').map(Number);
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      const first = `${next}-01`;
      if (first > end) break;
      out.push({ code: 'monthly', callDate: first });
      month = next;
    }
  }
  if (end) out.push({ code: 'reorder', callDate: addDaysKst(end, -10) });
  return out;
}

export interface ExistingDeskCall {
  code: string;
  callDate: string;
  entryId: string;
  /** 이미 처리했거나 전화를 시도한 해피콜(건드리면 안 된다) */
  touched: boolean;
}

export type DeskSyncOp =
  | { type: 'create'; code: DeskCallCode; callDate: string }
  | { type: 'remove'; entryId: string };

/**
 * 원하는 해피콜과 이미 만들어 둔 해피콜을 비교해 할 일을 정한다. 같은 (단계, 날짜)는 그대로 두고, 없는 것은 만들고(오늘 이후만 —
 * 이미 지난 날짜는 새로 만들지 않는다), 더 이상 필요 없는 것은 아직 손대지 않았을 때만 지운다.
 */
export function planDeskSync(desired: DesiredDeskCall[], existing: ExistingDeskCall[], today: string): DeskSyncOp[] {
  const have = new Set(existing.map((e) => `${e.code}|${e.callDate}`));
  const want = new Set(desired.map((d) => `${d.code}|${d.callDate}`));
  const ops: DeskSyncOp[] = [];
  for (const d of desired) {
    if (d.callDate < today || have.has(`${d.code}|${d.callDate}`)) continue;
    ops.push({ type: 'create', code: d.code, callDate: d.callDate });
  }
  for (const e of existing) {
    if (!want.has(`${e.code}|${e.callDate}`) && !e.touched) ops.push({ type: 'remove', entryId: e.entryId });
  }
  return ops;
}

const DESK_STAGE_ORDER: DeskCallCode[] = ['consult-done', 'paid', 'shipped', 'received', 'detox-eve', 'pill-start', 'monthly', 'reorder', 'finish'];

/** 같은 날 올라온 데스크 해피콜을 진행 순서(진료 후 → 결제 → 송장 → …)로 정렬하는 번호. 린다이어트 해피콜이 아니면 맨 뒤. */
export function deskStageRank(note: string | null | undefined): number {
  const code = deskCodeFromNote(note);
  return code ? DESK_STAGE_ORDER.indexOf(code) : DESK_STAGE_ORDER.length;
}

/** 해피콜 목록에 보여 줄 문구 — 종류 칸에 이미 "린다이어트"가 있어서 앞머리를 뺀다. */
export function deskNoteDisplay(note: string | null | undefined): string {
  if (!note) return '';
  return note.startsWith(DESK_NOTE_PREFIX) ? note.slice(DESK_NOTE_PREFIX.length) : note;
}

/**
 * 등록할 때 "진료 후 안내"를 올릴지. 디톡스를 이미 시작한 환자(시작일이 오늘보다 앞)는 진료 직후가 아니라 진행 중에 등록하는 것이라
 * 이 안내가 필요 없다(원장 요청, 2026-10-20).
 */
export function needsConsultDoneCall(detoxStartDate: string | null | undefined, today: string): boolean {
  return !detoxStartDate || detoxStartDate >= today;
}
