// 린다이어트 "기록 체크" 리포트(순수 로직) — 원장 요청 2026-10-24.
// 매일 아침 원장님 PC의 예약 작업이 린다이어트 차트에서 진행 중 환자의 앱 기록(식단 사진·체중·복약·컨디션)을 읽어 리포트를 만들고,
// 그 결과만 대시보드로 보낸다(차트 로그인 정보는 대시보드가 모른다). 여기서는 받은 데이터를 검증하고 화면용 묶음으로 나눈다.

export type RecordStatus = 'recording' | 'partial' | 'none';

export interface LeanCondition {
  date: string;
  bad: boolean;
  symptoms: string[];
  detail: string;
}

export interface LeanPatient {
  leanPatientId: string;
  /** 린다이어트 차트 번호(OK차트 번호와 다를 수 있다) */
  chartNumber: number | null;
  name: string;
  phone: string;
  doctor: string;
  week: number | null;
  recordStatus: RecordStatus;
  hasDiscomfort: boolean;
  dietYesterday: number;
  dietDayBefore: number;
  weightYesterday: boolean;
  medYesterday: number;
  nutritionTags: string[];
  lastDietDate: string | null;
  conditions: LeanCondition[];
  chartUrl: string;
}

export interface LeanSummary {
  total: number;
  discomfort: number;
  recording: number;
  partial: number;
  noRecord: number;
}

export interface LeanReport {
  reportDate: string;
  baseDate: string | null;
  generatedAt: string | null;
  criteria: string;
  summary: LeanSummary;
  patients: LeanPatient[];
}

export const MAX_REPORT_PATIENTS = 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CHART_URL_PREFIX = 'https://chart.leandiet.co.kr/';

function str(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function strList(v: unknown, maxItems = 20): string[] {
  return Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean).slice(0, maxItems) : [];
}

function parsePatient(raw: unknown): LeanPatient | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = str(o.name, 60);
  if (!name) return null;
  const status = o.recordStatus === 'recording' || o.recordStatus === 'partial' ? o.recordStatus : 'none';
  const chartUrl = str(o.chartUrl, 300);
  return {
    leanPatientId: str(o.leanPatientId, 80) || name,
    chartNumber: o.chartNumber == null || o.chartNumber === '' ? null : num(o.chartNumber, NaN) || null,
    name,
    phone: str(o.phone, 30),
    doctor: str(o.doctor, 30),
    week: o.week == null || o.week === '' ? null : Math.max(0, Math.round(num(o.week))),
    recordStatus: status,
    hasDiscomfort: o.hasDiscomfort === true,
    dietYesterday: Math.max(0, Math.round(num(o.dietYesterday))),
    dietDayBefore: Math.max(0, Math.round(num(o.dietDayBefore))),
    weightYesterday: o.weightYesterday === true,
    medYesterday: Math.max(0, Math.round(num(o.medYesterday))),
    nutritionTags: strList(o.nutritionTags),
    lastDietDate: DATE.test(str(o.lastDietDate, 10)) ? str(o.lastDietDate, 10) : null,
    conditions: (Array.isArray(o.conditions) ? o.conditions : []).slice(0, 10).flatMap((c) => {
      if (!c || typeof c !== 'object') return [];
      const x = c as Record<string, unknown>;
      return [{ date: str(x.date, 10), bad: x.bad === true, symptoms: strList(x.symptoms, 10), detail: str(x.detail, 300) }];
    }),
    // 차트 링크는 린다이어트 차트 주소만 받는다(다른 주소가 들어와도 링크로 쓰지 않는다).
    chartUrl: chartUrl.startsWith(CHART_URL_PREFIX) ? chartUrl : '',
  };
}

/** 받은 데이터를 검증해 리포트 모양으로 정리한다. 날짜가 없거나 환자 목록이 아니면 실패. */
export function parseReport(body: unknown): { ok: true; report: LeanReport } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: '본문이 올바르지 않아요.' };
  const o = body as Record<string, unknown>;
  const reportDate = str(o.reportDate, 10);
  if (!DATE.test(reportDate)) return { ok: false, error: 'reportDate(YYYY-MM-DD)가 필요해요.' };
  if (!Array.isArray(o.patients)) return { ok: false, error: 'patients 배열이 필요해요.' };
  if (o.patients.length > MAX_REPORT_PATIENTS) return { ok: false, error: `환자가 너무 많아요(최대 ${MAX_REPORT_PATIENTS}명).` };
  const patients = o.patients.map(parsePatient).filter((p): p is LeanPatient => p !== null);
  const baseDate = str(o.baseDate, 10);
  const generatedAt = str(o.generatedAt, 40);
  return {
    ok: true,
    report: {
      reportDate,
      baseDate: DATE.test(baseDate) ? baseDate : null,
      generatedAt: generatedAt || null,
      criteria: str(o.criteria, 300),
      // 요약은 보낸 값을 믿지 않고 환자 목록에서 다시 센다(목록과 숫자가 어긋나지 않게).
      summary: summarize(patients),
      patients,
    },
  };
}

export function summarize(patients: LeanPatient[]): LeanSummary {
  return {
    total: patients.length,
    discomfort: patients.filter((p) => p.hasDiscomfort).length,
    recording: patients.filter((p) => p.recordStatus === 'recording').length,
    partial: patients.filter((p) => p.recordStatus === 'partial').length,
    noRecord: patients.filter((p) => p.recordStatus === 'none').length,
  };
}

export interface ReportSections {
  /** 🔴 불편 사항이 있는 환자(기록 상태와 상관없이 가장 먼저) */
  discomfort: LeanPatient[];
  /** 🟡 식단 기록이 끊긴(체중·복약만 있는) 환자 */
  partial: LeanPatient[];
  /** ⚪ 기록이 전혀 없는 환자 — 주차로 묶는다 */
  none: { early: LeanPatient[]; mid: LeanPatient[]; late: LeanPatient[] };
  /** ✅ 기록을 잘 하는 환자 */
  recording: LeanPatient[];
}

const byWeekThenName = (a: LeanPatient, b: LeanPatient) => (a.week ?? 999) - (b.week ?? 999) || a.name.localeCompare(b.name, 'ko');

/**
 * 환자를 화면 구역으로 나눈다. 한 환자는 한 구역에만 들어간다 — 불편 사항이 있으면 기록 상태와 상관없이 🔴, 그 밖에는 기록 상태대로.
 * 기록 없음은 4주차 이내 / 5~12주차 / 13주차 이상(주차를 모르면 5~12주차)으로 묶는다.
 */
export function groupReportPatients(patients: LeanPatient[]): ReportSections {
  const discomfort = patients.filter((p) => p.hasDiscomfort).sort(byWeekThenName);
  const rest = patients.filter((p) => !p.hasDiscomfort);
  const none = rest.filter((p) => p.recordStatus === 'none').sort(byWeekThenName);
  return {
    discomfort,
    partial: rest.filter((p) => p.recordStatus === 'partial').sort(byWeekThenName),
    none: {
      early: none.filter((p) => p.week != null && p.week <= 4),
      mid: none.filter((p) => p.week == null || (p.week >= 5 && p.week <= 12)),
      late: none.filter((p) => p.week != null && p.week >= 13),
    },
    recording: rest.filter((p) => p.recordStatus === 'recording').sort(byWeekThenName),
  };
}

/** 불편 사항 원문(최근 컨디션의 증상·메모) — 중복을 빼고 보여 준다. */
export function discomfortTexts(p: LeanPatient): string[] {
  const out: string[] = [];
  for (const c of p.conditions) {
    for (const s of [...c.symptoms, c.detail]) {
      const t = s.trim();
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

/** 해피콜에 적어 줄 한 줄 사유 — "불편: 변비, …", "식단 기록 끊김", "기록 없음". 해피콜 문구는 짧게 80자로 줄인다. */
export function followUpReason(p: LeanPatient): string {
  let text: string;
  if (p.hasDiscomfort) {
    const symptoms = discomfortTexts(p);
    text = symptoms.length > 0 ? `불편: ${symptoms.join(', ')}` : '불편 사항 확인';
  } else if (p.recordStatus === 'partial') {
    text = '식단 기록 끊김(체중·복약만 기록)';
  } else if (p.recordStatus === 'none') {
    text = '기록 없음';
  } else {
    text = '기록 확인';
  }
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/** 오늘 리포트가 도착했는가 — 가장 최근 리포트의 날짜가 오늘이어야 한다. */
export function isReportFresh(reportDate: string | null, today: string): boolean {
  return reportDate === today;
}

/** 직원 해피콜·원장 케어 보드로 보낸 환자는 보낸 날부터 이 일수 동안 목록에서 뺀다(그 뒤에도 조건에 맞으면 다시 나온다). */
export const SENT_HIDE_DAYS = 7;

/** 제외할 때 고르는 사유 */
export const EXCLUDE_REASONS = ['기록 안 하기로 함', '종료한 환자', '기타'] as const;

export interface SentRef {
  leanPatientId: string;
  reportDate: string;
  target: 'desk' | 'owner';
}

export interface SentPatient {
  patient: LeanPatient;
  /** 어디로 보냈는지 */
  targets: ('desk' | 'owner')[];
  /** 가장 최근에 보낸 리포트 날짜 */
  sentDate: string;
}

/**
 * 리포트의 환자를 셋으로 나눈다 — 제외한 환자(다시 안 나온다), 최근 보낸 환자(보낸 날부터 SENT_HIDE_DAYS 일 동안 숨김), 지금 연락을 검토할 환자.
 * 제외가 보낸 것보다 우선한다. addDays 는 날짜 계산 함수(YYYY-MM-DD, 일수).
 */
export function partitionPatients(
  patients: LeanPatient[],
  followups: SentRef[],
  excludedIds: Set<string>,
  reportDate: string,
  addDays: (date: string, days: number) => string
): { active: LeanPatient[]; sent: SentPatient[]; excluded: LeanPatient[] } {
  const windowStart = addDays(reportDate, -(SENT_HIDE_DAYS - 1));
  const active: LeanPatient[] = [];
  const sent: SentPatient[] = [];
  const excluded: LeanPatient[] = [];
  for (const p of patients) {
    if (excludedIds.has(p.leanPatientId)) {
      excluded.push(p);
      continue;
    }
    const mine = followups.filter((f) => f.leanPatientId === p.leanPatientId && f.reportDate >= windowStart && f.reportDate <= reportDate);
    if (mine.length === 0) {
      active.push(p);
      continue;
    }
    sent.push({
      patient: p,
      targets: [...new Set(mine.map((f) => f.target))],
      sentDate: mine.map((f) => f.reportDate).sort().slice(-1)[0],
    });
  }
  return { active, sent, excluded };
}
