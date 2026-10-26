// 케어 보드 "오늘 연락할 분" — 같은 환자에게 해피콜 날짜(케어 보드 환자)와 카톡 보낼 차례(린다이어트 프로그램)가 겹치면 한 칸으로 묶는다(원장 요청, 2026-10-26).
import type { DietProgram, DueMessage } from './dietProgram';
import { samePatient } from './dietReminders';
import { diffDaysKst } from './kst';
import type { CarePatient } from './supabase/herbCare';

export interface TodayContact {
  key: string;
  patientName: string;
  chartNo: string;
  /** 해피콜 날짜가 된 케어 보드 환자(없으면 null) */
  care: CarePatient | null;
  /** 오늘 카톡을 보낼 차례인 것들(문구가 함께 보인다) */
  messages: { item: DueMessage; program: DietProgram }[];
  /** 가장 많이 밀린 일수 — 밀린 사람이 위로 온다 */
  overdueDays: number;
}

/** 다음 해피콜 날짜를 바로 고르는 빠른 선택(해피콜 완료를 누르면 보인다). */
export const NEXT_CALL_PRESETS = [
  { label: '3일 후', days: 3 },
  { label: '1주 후', days: 7 },
  { label: '2주 후', days: 14 },
  { label: '한 달 후', days: 30 },
] as const;

export function groupTodayContacts(careDue: CarePatient[], due: DueMessage[], programs: DietProgram[], today: string): TodayContact[] {
  const groups: TodayContact[] = careDue.map((c) => ({
    key: `care|${c.id}`,
    patientName: c.patientName,
    chartNo: c.chartNo,
    care: c,
    messages: [],
    overdueDays: c.nextCallDate ? Math.max(0, diffDaysKst(c.nextCallDate, today)) : 0,
  }));
  const byProgram = new Map(programs.map((p) => [p.id, p]));
  for (const item of due) {
    const program = byProgram.get(item.programId);
    if (!program) continue;
    let group = groups.find((g) => samePatient({ patientName: g.patientName, chartNo: g.chartNo }, program));
    if (!group) {
      group = { key: `program|${program.id}`, patientName: program.patientName, chartNo: program.chartNo, care: null, messages: [], overdueDays: 0 };
      groups.push(group);
    }
    group.messages.push({ item, program });
    group.overdueDays = Math.max(group.overdueDays, item.overdueDays);
  }
  return groups.sort((a, b) => b.overdueDays - a.overdueDays || a.patientName.localeCompare(b.patientName, 'ko'));
}
