// 린다이어트 환자의 예약 전날 리마인드(순수 로직) — 예약관리의 "내일 예약"과 진행 중인 린다이어트 프로그램을 맞춰 본다(원장 요청, 2026-10-21).
// 약 소진 전 예약 안내는 상담 때 직접 하므로 만들지 않고, 이미 잡힌 예약의 전날에 데스크가 리마인드만 한다.

export interface ReminderProgram {
  id: string;
  patientName: string;
  chartNo: string;
}

export interface ReminderReservation {
  patientName: string;
  chartNo: string;
  timeLabel: string;
}

export interface ReminderMatch {
  programId: string;
  timeLabel: string;
}

// 차트번호는 앞의 0이나 공백이 달라도 같은 번호로 본다("003637" = "3637").
function normalizeChart(chartNo: string): string {
  return chartNo.replace(/\s+/g, '').replace(/^0+/, '');
}

/**
 * 같은 환자인가 — 양쪽에 차트번호가 있으면 차트번호가 같아야 하고(동명이인을 가린다), 어느 한쪽에 차트번호가 없으면 이름이 같으면 된다.
 */
export function samePatient(a: { patientName: string; chartNo: string }, b: { patientName: string; chartNo: string }): boolean {
  const ac = normalizeChart(a.chartNo);
  const bc = normalizeChart(b.chartNo);
  return ac && bc ? ac === bc : a.patientName.trim() === b.patientName.trim();
}

/**
 * 진행 중인 프로그램과 그 날의 예약을 맞춘다. 양쪽에 차트번호가 있으면 차트번호가 같아야 하고(동명이인을 가린다),
 * 어느 한쪽에 차트번호가 없으면 이름이 같으면 된다. 한 프로그램에 예약이 여러 개면 가장 이른 시간 하나만.
 */
export function matchReminders(programs: ReminderProgram[], reservations: ReminderReservation[]): ReminderMatch[] {
  const matches: ReminderMatch[] = [];
  for (const p of programs) {
    const found = reservations
      .filter((r) => samePatient(p, r))
      .sort((a, b) => a.timeLabel.localeCompare(b.timeLabel))[0];
    if (found) matches.push({ programId: p.id, timeLabel: found.timeLabel });
  }
  return matches;
}

/** 해피콜 문구에 붙일 예약 정보 — "10/23 14:30" */
export function reminderDetail(date: string, timeLabel: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}${timeLabel.trim() ? ` ${timeLabel.trim()}` : ''}`;
}
