// 초진 후보 판정 — 순수 함수. 날짜는 모두 한국(KST) 기준 YYYY-MM-DD 문자열이다.
//
// 원장 결정: 재초진 = 마지막 내원일로부터 달력 기준 3개월 이상 지나 다시 온 환자.
// 예약 기록은 이 대시보드를 쓰기 시작한 뒤부터만 있으므로, 이전 기록이 없다는 것은
// "초진(추정)"일 뿐이다(직원이 확인해서 등록한다).

export type VisitClassification = '초진(추정)' | '재초진' | '재진';

/** 달력 기준으로 n개월을 더한다(음수 가능). 도착 달에 그 날이 없으면 말일로 맞춘다. 예) 11-30 - 3개월 = 08-30, 05-31 - 3개월 = 02-28. */
export function addMonthsKst(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12; // 0-based
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * previousVisitDates: 이 환자의 이전 내원일들(중복·순서 무관). today: 이번 내원일.
 * today 당일 이후의 날짜는 "이전 내원"이 아니므로 무시한다(같은 날 중복 예약 등).
 */
export function classifyVisit(previousVisitDates: string[], today: string): VisitClassification {
  let last: string | null = null;
  for (const date of previousVisitDates) {
    if (!date || date >= today) continue;
    if (last === null || date > last) last = date;
  }
  if (last === null) return '초진(추정)';
  return last <= addMonthsKst(today, -3) ? '재초진' : '재진';
}

// --- 환자 동일성 판단 ---

export interface PersonKey {
  name: string;
  chartNo?: string | null;
  /** 전화번호/휴대폰 등 알려진 번호 전부 */
  phones?: (string | null | undefined)[];
}

export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '');
}

function phoneSet(person: PersonKey): Set<string> {
  const set = new Set<string>();
  for (const p of person.phones ?? []) {
    const n = normalizePhone(p);
    if (n) set.add(n);
  }
  return set;
}

/**
 * 같은 사람인가. 둘 다 차트번호가 있으면 차트번호만 본다. 아니면 이름이 같고, 전화번호가
 * 하나라도 겹치거나(번호가 한쪽이라도 비어 있으면 이름만으로) 판단한다.
 */
export function isSamePatient(a: PersonKey, b: PersonKey): boolean {
  const chartA = (a.chartNo ?? '').trim();
  const chartB = (b.chartNo ?? '').trim();
  if (chartA && chartB) return chartA === chartB;
  if (!a.name.trim() || a.name.trim() !== b.name.trim()) return false;
  const phonesA = phoneSet(a);
  const phonesB = phoneSet(b);
  if (phonesA.size === 0 || phonesB.size === 0) return true;
  for (const p of phonesA) if (phonesB.has(p)) return true;
  return false;
}

export interface ReservationLike {
  patientName: string;
  chartNo: string;
  phone: string;
  mobile: string;
  visitStatus: string;
  doctorName: string;
  timeLabel: string;
}

export interface VisitCandidate {
  patientName: string;
  chartNo: string;
  phone: string;
  doctorName: string;
  timeLabel: string;
}

export function reservationKey(r: Pick<ReservationLike, 'patientName' | 'chartNo' | 'phone' | 'mobile'>): PersonKey {
  return { name: r.patientName, chartNo: r.chartNo, phones: [r.mobile, r.phone] };
}

/**
 * 그날 예약 명단에서 오는 사람 목록(취소 제외, 같은 사람의 중복 예약은 하나로).
 * 표시할 연락처는 휴대폰을 우선한다.
 */
export function dedupeVisitCandidates(rows: ReservationLike[]): VisitCandidate[] {
  const result: VisitCandidate[] = [];
  const keys: PersonKey[] = [];
  for (const row of rows) {
    if (row.visitStatus === '취소' || !row.patientName.trim()) continue;
    const key = reservationKey(row);
    if (keys.some((k) => isSamePatient(k, key))) continue;
    keys.push(key);
    result.push({
      patientName: row.patientName.trim(),
      chartNo: row.chartNo.trim(),
      phone: (row.mobile || row.phone).trim(),
      doctorName: row.doctorName.trim(),
      timeLabel: row.timeLabel.trim(),
    });
  }
  return result;
}

/** GET /api/first-visit-candidates 응답의 후보 한 명. */
export interface FirstVisitCandidateDto extends VisitCandidate {
  /** 이 환자의 이전 내원일(예약 명단에서 "내원"으로 표시된 날, 오래된 순, 중복 없음) */
  previousVisitDates: string[];
}

export interface FirstVisitCandidatesResult {
  date: string;
  /** 그 날짜의 예약 명단(daily_records)이 저장되어 있는지 */
  hasRecord: boolean;
  /** daily_records.first_visit_count — 마감 결산에 적힌 초진 수(없으면 null) */
  closingFirstVisitCount: number | null;
  candidates: FirstVisitCandidateDto[];
}

export interface PriorVisitRow {
  date: string;
  patientName: string;
  chartNo: string;
  phone: string;
  mobile: string;
}

/** 후보 한 명의 이전 내원일(중복 제거, 오래된 순). beforeDate 당일 이후는 뺀다. */
export function previousVisitDatesFor(candidate: VisitCandidate, prior: PriorVisitRow[], beforeDate: string): string[] {
  const key: PersonKey = { name: candidate.patientName, chartNo: candidate.chartNo, phones: [candidate.phone] };
  const dates = new Set<string>();
  for (const row of prior) {
    if (row.date >= beforeDate) continue;
    if (isSamePatient(key, reservationKey(row))) dates.add(row.date);
  }
  return [...dates].sort();
}
