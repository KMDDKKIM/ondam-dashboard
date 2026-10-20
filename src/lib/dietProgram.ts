// 린다이어트 프로그램 카드와 "원장 카톡" 일정 계산(순수 로직) — 원장 요청 2026-10-20.
// 기준은 온유한의원 사례의 대면/비대면 해피콜 문서다. 그중 원장이 직접 보내는 카톡 9개만 이 파일이 계산하고,
// 코디(데스크) 담당 메시지는 다음 단계에서 해피콜 목록에 붙인다. 화면/DB 코드는 supabase/dietPrograms.ts.

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
  lastRecordDate: string | null;
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
  | 'checkin'         // 공4 기록 잘하는 환자 안부(원장 연락 3일 간격)
  | 'weekly'          // 공5 매주 월요일 문안
  | 'no-record'       // 공7 기록이 끊긴 환자 안부
  | 'refill'          // 공9 약 소진 4일 전 연복 권유
  | 'holiday';        // 공10 연휴 전 공지

export const OWNER_MESSAGE_LABEL: Record<OwnerMessageCode, string> = {
  'visit-revisit': '재진 후 단계 전환 안내',
  'remote-second': '2차 상담 후 재처방 안내',
  'remote-nudge': '2차 상담 일정 확인 안부',
  'pill-day1': '다이어트환 첫날 안부',
  checkin: '기록 잘하는 분 안부',
  weekly: '월요일 문안',
  'no-record': '기록이 끊긴 분 안부',
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

  // 공4: 기록은 잘 올라오는데(마지막 기록이 하루 안) 원장 연락이 3일 지났다
  if (started && pillStart && p.lastRecordDate && diffDaysKst(p.lastRecordDate, today) <= 1) {
    const base = p.lastDoctorContactDate ?? pillStart;
    out.push({ code: 'checkin', dueDate: addDaysKst(base, 3), windowDays: 7 });
  }

  // 공5: 월요일마다(복용 중인 환자에게). 월요일 당일에만 보인다.
  if (started && stillOnMedicine && weekdayKo(today) === '월') out.push({ code: 'weekly', dueDate: today, windowDays: 0 });

  // 공7: 마지막 기록이 3일 넘게 없다
  if (started && p.lastRecordDate) out.push({ code: 'no-record', dueDate: addDaysKst(p.lastRecordDate, 3), windowDays: 4 });

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
