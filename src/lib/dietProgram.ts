// 린다이어트 프로그램과 해피콜 일정 계산(순수 로직) — 원장 요청 2026-10-20·21.
// 비급여 현황에서 린다이어트 결제를 등록할 때 디톡스 시작일·주수를 적으면 프로그램이 만들어지고, 아래 규칙으로
//  - 데스크(해피콜 목록): 디톡스 시작일·다음날·다다음날(디톡스 3일)
//  - 원장(케어 보드): 다이어트환 시작일(디톡스가 끝난 다음 날)
// 에 연락할 일이 자동으로 올라간다. 그 뒤(월요일 문안, 연복 권유, 연휴 공지 등)는 어떻게 할지 정해질 때까지 꺼 둔다(LATER_OWNER_MESSAGES).
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
  /** 이 프로그램을 만든 비급여 결제(없으면 null) */
  purchaseId: string | null;
}

export const TRACK_LABEL: Record<DietTrack, string> = { visit: '대면', remote: '비대면' };

/**
 * 린다이어트 프로그램을 만드는 비급여 결제인가 — 목표 반영이 다이어트이고 상품명에 "린다이어트"가 든 결제.
 * (같은 다이어트 목표여도 "린데일리" 같은 다른 상품은 프로그램이 아니다.)
 */
export function isDietProgramPurchase(productName: string, goalCategory: string | null): boolean {
  return goalCategory === 'diet' && productName.replace(/\s+/g, '').includes('린다이어트');
}

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
  | 'pill-start'      // 다이어트환 시작일 — 컨디션 확인과 식단 안내(원장 직접)
  | 'visit-revisit'   // 대8 재진 후 단계 전환 안내
  | 'remote-second'   // 비10 2차 상담 후 재처방 안내
  | 'remote-nudge'    // 비9 2차 상담이 아직 안 잡힌 비대면 환자 안부
  | 'pill-day1'       // 공3 다이어트환 시작 다음 날 안부
  | 'weekly'          // 공5 매주 월요일 문안
  | 'refill'          // 공9 약 소진 4일 전 연복 권유
  | 'holiday';        // 공10 연휴 전 공지

export const OWNER_MESSAGE_LABEL: Record<OwnerMessageCode, string> = {
  'pill-start': '다이어트환 시작 안부·식단 안내',
  'visit-revisit': '재진 후 단계 전환 안내',
  'remote-second': '2차 상담 후 재처방 안내',
  'remote-nudge': '2차 상담 일정 확인 안부',
  'pill-day1': '다이어트환 첫날 안부',
  weekly: '월요일 문안',
  refill: '연복 권유(약 소진 임박)',
  holiday: '연휴 전 공지',
};

/**
 * 다이어트환 시작일 이후의 원장 카톡(월요일 문안·연복 권유·연휴 공지 등)을 자동으로 올릴지. 그 뒤를 어떻게 할지 정해질 때까지 꺼 둔다
 * (원장 결정, 2026-10-21). 규칙 코드는 남겨 두었으니 정해지면 켜거나 고쳐 쓴다.
 */
export const LATER_OWNER_MESSAGES = false;

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

function candidates(p: DietProgram, today: string, holidays: readonly string[], later: boolean): Candidate[] {
  const out: Candidate[] = [];
  const pillStart = dietPillStartDate(p);

  // 다이어트환 시작일 — 원장이 직접 연락한다(디톡스 3일은 데스크가 연락).
  if (pillStart) out.push({ code: 'pill-start', dueDate: pillStart, windowDays: 2 });

  if (!later) return out;

  const end = medicineEndDate(p);
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
 * options.later 로 다이어트환 시작일 이후의 메시지를 켜고 끈다(기본은 LATER_OWNER_MESSAGES).
 */
export function ownerDueMessages(
  programs: DietProgram[],
  today: string,
  sends: SendKey[],
  holidays: readonly string[] = CLINIC_HOLIDAYS,
  options: { later?: boolean } = {}
): DueMessage[] {
  const later = options.later ?? LATER_OWNER_MESSAGES;
  const done = new Set(sends.map((s) => `${s.programId}|${s.code}|${s.dueDate}`));
  const result: DueMessage[] = [];
  for (const p of programs) {
    if (p.status !== 'active') continue;
    for (const c of candidates(p, today, holidays, later)) {
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

// ---- 데스크 해피콜 ----
// 디톡스 시작일, 그 다음날, 다다음날(디톡스 3일)에 데스크가 해피콜 목록에서 연락한다(원장 결정, 2026-10-21).

export type DeskCallCode = 'detox-day1' | 'detox-day2' | 'detox-day3';

const DESK_CODES: readonly DeskCallCode[] = ['detox-day1', 'detox-day2', 'detox-day3'];

/** 날짜로 정해지는 데스크 해피콜 종류(프로그램 날짜가 바뀌면 다시 맞춘다). */
export const SCHEDULED_DESK_CODES: readonly DeskCallCode[] = DESK_CODES;

/** 해피콜 목록에 적히는 문구의 앞머리 — 목록에서 린다이어트 해피콜을 알아보고 문구(스크립트)를 찾는 데 쓴다. */
export const DESK_NOTE_PREFIX = '린다이어트 · ';

export function deskCallLabel(code: DeskCallCode): string {
  switch (code) {
    case 'detox-day1':
      return '디톡스 시작일 복용법 안내';
    case 'detox-day2':
      return '디톡스 2일차 컨디션 확인';
    case 'detox-day3':
      return '디톡스 3일차 컨디션 확인';
  }
}

export function deskCallNote(code: DeskCallCode): string {
  return DESK_NOTE_PREFIX + deskCallLabel(code);
}

/** 해피콜 목록의 문구로 어떤 데스크 해피콜인지 찾는다(린다이어트 해피콜이 아니거나 모르는 문구면 null). */
export function deskCodeFromNote(note: string | null | undefined): DeskCallCode | null {
  if (!note || !note.startsWith(DESK_NOTE_PREFIX)) return null;
  const label = note.slice(DESK_NOTE_PREFIX.length).trim();
  return DESK_CODES.find((code) => deskCallLabel(code) === label) ?? null;
}

export interface DesiredDeskCall {
  code: DeskCallCode;
  callDate: string;
}

/** 디톡스 시작일, 다음날, 다다음날에 거는 데스크 해피콜. 디톡스 시작일을 모르면 없다. */
export function scheduledDeskCalls(p: Pick<DietProgram, 'detoxStartDate'>): DesiredDeskCall[] {
  if (!p.detoxStartDate) return [];
  return DESK_CODES.map((code, i) => ({ code, callDate: addDaysKst(p.detoxStartDate as string, i) }));
}

/** 같은 날 올라온 데스크 해피콜을 진행 순서로 정렬하는 번호. 린다이어트 해피콜이 아니면 맨 뒤. */
export function deskStageRank(note: string | null | undefined): number {
  const code = deskCodeFromNote(note);
  return code ? DESK_CODES.indexOf(code) : DESK_CODES.length;
}

/** 해피콜 목록에 보여 줄 문구 — 종류 칸에 이미 "린다이어트"가 있어서 앞머리를 뺀다. */
export function deskNoteDisplay(note: string | null | undefined): string {
  if (!note) return '';
  return note.startsWith(DESK_NOTE_PREFIX) ? note.slice(DESK_NOTE_PREFIX.length) : note;
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
