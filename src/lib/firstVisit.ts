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

/** 재등록 차트("006366-1")는 같은 환자의 두 번째 차트라서, 같은 사람인지 볼 때는 "-숫자"를 떼고 본다. */
export function baseChartNo(chartNo: string): string {
  return chartNo.trim().replace(/-\d+$/, '');
}

function bothHaveChart(a: PersonKey, b: PersonKey): boolean {
  return Boolean((a.chartNo ?? '').trim() && (b.chartNo ?? '').trim());
}

/**
 * 같은 사람인가(엄격). 둘 다 차트번호가 있으면 차트번호만 본다(이름 오타와 무관).
 * 아니면 이름과 전화번호가 둘 다 있고 서로 같을 때만(전화번호 하나라도 겹침) 같은 사람으로 본다.
 * 번호가 한쪽이라도 없으면 같은 사람으로 보지 않는다 — 동명이인 때문에 진짜 초진이 가려지면 안 되므로.
 */
export function isSamePatient(a: PersonKey, b: PersonKey): boolean {
  if (bothHaveChart(a, b)) return baseChartNo(a.chartNo ?? '') === baseChartNo(b.chartNo ?? '');
  if (!a.name.trim() || a.name.trim() !== b.name.trim()) return false;
  const phonesA = phoneSet(a);
  const phonesB = phoneSet(b);
  if (phonesA.size === 0 || phonesB.size === 0) return false;
  for (const p of phonesA) if (phonesB.has(p)) return true;
  return false;
}

/**
 * 이름은 같은데 차트번호도 전화번호도 확인할 수 없어(한쪽 번호가 비어 있음) 같은 사람인지 모르는 경우.
 * 이전 내원으로 세지는 않지만, 후보 목록에 "동명이인 가능"으로 남겨 직원이 확인하게 한다.
 */
export function isPossibleHomonym(a: PersonKey, b: PersonKey): boolean {
  if (bothHaveChart(a, b)) return false;
  if (!a.name.trim() || a.name.trim() !== b.name.trim()) return false;
  if (isSamePatient(a, b)) return false;
  return phoneSet(a).size === 0 || phoneSet(b).size === 0;
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
    // 취소·노쇼 예약은 오는 사람이 아니다.
    if (row.visitStatus === '취소' || row.visitStatus.includes('노쇼') || !row.patientName.trim()) continue;
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

export interface SettlementVisitLike {
  patientName: string;
  chartNo: string;
  doctorName: string;
}

/**
 * 일일결산에 저장된 그날 내원 환자에서 후보 목록을 만든다(같은 차트번호는 한 명, 차트번호가 없으면 이름으로).
 * 연락처·시간은 결산표에 없어 비워 두고, 서버가 예약 기록에서 찾을 수 있으면 채운다.
 */
export function dedupeSettlementVisits(rows: SettlementVisitLike[]): VisitCandidate[] {
  const seen = new Set<string>();
  const result: VisitCandidate[] = [];
  for (const row of rows) {
    const name = row.patientName.trim();
    if (!name) continue;
    const chart = row.chartNo.trim();
    const key = chart ? `c:${chart}` : `n:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ patientName: name, chartNo: chart, phone: '', doctorName: row.doctorName.trim(), timeLabel: '' });
  }
  return result;
}

/**
 * 결산표의 신규환자수 N명 → 그날 차트번호가 가장 큰 N명이 새 차트(초진)일 가능성이 높다(새 환자는 항상 가장 큰 번호를 받는다).
 * 차트번호가 숫자가 아닌 사람이 있거나 신규환자수를 모르면 판단하지 않고 null.
 */
export function likelyNewChartNos(chartNos: string[], newPatientCount: number | null): Set<string> | null {
  if (newPatientCount == null) return null;
  if (chartNos.length === 0 || chartNos.some((c) => !/^\d+$/.test(c))) return null;
  const sorted = [...new Set(chartNos)].sort((a, b) => Number(b) - Number(a));
  return new Set(sorted.slice(0, newPatientCount));
}

export interface SettlementClassifyInput {
  chartNo: string;
  /** 이 환자의 이전 내원일(일일결산 기록 + 예약 기록 + 가져온 내원 이력) */
  previousVisitDates: string[];
  date: string;
  /** 결산표 신규환자수 기준으로 새 차트로 보이는 차트번호들(판단할 수 없으면 null) */
  newChartNos: Set<string> | null;
  /** 내원일 이전에 이미 있던 차트 중 가장 큰 차트번호(모르면 null) */
  maxKnownChart: number | null;
  /** 가져온 내원 이력표에서 이 차트의 등록일이 내원일과 같다 */
  registeredOnDate: boolean;
  /** 최근 3개월 내원 기록을 빠짐없이 가지고 있어서, 기록이 없으면 "3개월 안에 안 왔다"고 볼 수 있다 */
  windowCovered: boolean;
}

/**
 * 일일결산 명단의 후보를 초진/재초진/재진으로 가른다(이유도 함께).
 * 이전 내원 기록이 있으면 그것으로(마지막 내원 3개월 이상 전이면 재초진), 기록이 없으면 차트번호로 본다:
 * 새 차트(등록일이 내원일이거나, 기존 차트보다 번호가 큼)는 초진, 예전 차트인데 3개월 기록이 없으면 재초진.
 */
export interface SettlementClassification {
  kind: VisitClassification;
  reason: string;
  /**
   * 오늘 새로 만든 재등록 차트("000058-1")라서 결산표의 신규환자수에 이미 들어 있는 재초진.
   * 누락 대조에서 "신규환자수 + 재초진 후보"로 셀 때 이 사람을 두 번 세지 않도록 표시한다.
   */
  countedInNewCount?: boolean;
}

/** 재등록 차트 여부: 같은 환자가 다시 등록되면 원래 차트번호 뒤에 "-1", "-2"가 붙는다. */
export function isReissuedChart(chartNo: string): boolean {
  return /-\d+$/.test(chartNo.trim());
}

export function classifySettlementCandidate(input: SettlementClassifyInput): SettlementClassification {
  const { chartNo, previousVisitDates, date, newChartNos, maxKnownChart, registeredOnDate, windowCovered } = input;
  const byHistory = classifyVisit(previousVisitDates, date);
  if (byHistory === '재진') return { kind: '재진', reason: '최근 3개월 안에 내원한 기록이 있어요' };
  if (byHistory === '재초진') return { kind: '재초진', reason: '마지막 내원이 3개월 이상 전이에요' };

  if (registeredOnDate) return { kind: '초진(추정)', reason: '차트 등록일이 내원일이에요' };
  // 이전 기록이 없는 재등록 차트(-1)는 오늘 새로 만든 차트다: 예전에 왔던 환자가 다시 등록한 재초진이고, 결산 신규환자수에도 잡힌다.
  if (isReissuedChart(chartNo)) {
    return { kind: '재초진', reason: '재등록 차트(-숫자)예요 — 결산 신규환자수에 들어 있어요', countedInNewCount: true };
  }
  const base = baseChartNo(chartNo);
  const chartNumber = /^\d+$/.test(base) ? Number(base) : null;
  if (chartNumber !== null && maxKnownChart !== null && chartNumber > maxKnownChart) {
    return { kind: '초진(추정)', reason: '기존 차트보다 번호가 큰 새 차트예요' };
  }
  if (newChartNos?.has(chartNo)) return { kind: '초진(추정)', reason: '신규환자수 기준 새 차트예요' };
  if (windowCovered && chartNumber !== null) {
    return { kind: '재초진', reason: '예전 차트인데 최근 3개월 내원 기록이 없어요' };
  }
  if (newChartNos !== null) return { kind: '재진', reason: '새 차트가 아니고 이전 기록도 없어요(이전 내원 이력을 가져오면 더 정확해져요)' };
  return { kind: '초진(추정)', reason: '이전 내원 기록이 없어요' };
}

/** GET /api/first-visit-candidates 응답의 후보 한 명. */
export interface FirstVisitCandidateDto extends VisitCandidate {
  /** 일일결산 기반일 때 서버가 정한 판정과 그 이유(예약 명단 기반이면 없음 — 화면이 이전 내원일로 판정) */
  kind?: VisitClassification;
  kindReason?: string;
  /** 결산 신규환자수에 이미 들어 있는 재초진(오늘 새로 만든 재등록 차트) */
  countedInNewCount?: boolean;
  /** 그날 신규환자수 기준으로 차트번호가 새 차트로 보이는가(일일결산 기반일 때만, 판단할 수 없으면 null) */
  likelyNewChart?: boolean | null;
  /** 이 환자의 이전 내원일(예약 명단에서 "내원"으로 표시된 날, 오래된 순, 중복 없음) */
  previousVisitDates: string[];
  /** 이름이 같은 이전 기록이 있지만 번호를 확인할 수 없어 같은 사람인지 모름(이전 내원으로 세지 않음) */
  possibleHomonym: boolean;
}

export interface FirstVisitCandidatesResult {
  date: string;
  /** 후보를 어디서 뽑았나 — settlement: 일일결산의 내원 환자 명단, reservation: 예약 명단 */
  source?: 'settlement' | 'reservation';
  /** 그 날짜의 명단(일일결산 환자 목록 또는 예약 명단)이 저장되어 있는지 */
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

/** 이름이 같지만 확인할 수 없는 이전 기록이 있는가(beforeDate 이전만). */
export function hasPossibleHomonym(candidate: VisitCandidate, prior: PriorVisitRow[], beforeDate: string): boolean {
  const key: PersonKey = { name: candidate.patientName, chartNo: candidate.chartNo, phones: [candidate.phone] };
  return prior.some((row) => row.date < beforeDate && isPossibleHomonym(key, reservationKey(row)));
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
