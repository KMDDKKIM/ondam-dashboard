import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { diffDaysKst } from '@/lib/kst';
import {
  addMonthsKst,
  baseChartNo,
  classifySettlementCandidate,
  dedupeSettlementVisits,
  dedupeVisitCandidates,
  hasPossibleHomonym,
  likelyNewChartNos,
  previousVisitDatesFor,
  type FirstVisitCandidatesResult,
  type PriorVisitRow,
  type VisitCandidate,
} from '@/lib/firstVisit';
import { getDailyRecordByDate } from './dailyRecords.server';

// 예약관리 테이블(daily_records/reservations)은 다른 앱 소유라 RLS가 로그인 사용자를 막아 둔다.
// 그래서 브라우저가 아니라 이 서버 함수(admin 클라이언트)로만 읽고, 호출하는 API 라우트가
// 로그인/승인을 확인한다. 읽기 전용 — 이 파일은 그 테이블에 아무것도 쓰지 않는다.
const supabase = createAdminClient();

const IN_CHUNK = 100;
const PAGE = 1000;

interface PriorReservationRow {
  daily_record_id: string;
  patient_name: string;
  chart_no: string;
  phone: string;
  mobile: string;
}

async function fetchPriorReservations(column: 'chart_no' | 'patient_name', values: string[]): Promise<PriorReservationRow[]> {
  const rows: PriorReservationRow[] = [];
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const chunk = values.slice(i, i + IN_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('reservations')
        .select('daily_record_id, patient_name, chart_no, phone, mobile')
        .eq('visit_status', '내원')
        .in(column, chunk)
        .order('daily_record_id')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const page = (data ?? []) as PriorReservationRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return rows;
}

// 예약 기록(내원으로 표시된 예약)에서 후보들의 이전 내원 기록을 모은다. beforeDate 이전 날짜만 남긴다.
async function loadReservationPrior(candidates: VisitCandidate[], beforeDate: string): Promise<PriorVisitRow[]> {
  if (candidates.length === 0) return [];
  const chartNos = [...new Set(candidates.map((c) => c.chartNo).filter(Boolean))];
  const names = [...new Set(candidates.map((c) => c.patientName))];

  // 차트번호가 있으면 차트번호로, 이름으로도 한 번 더(이전 기록에 차트번호가 비어 있을 수 있어서) 찾는다.
  const [byChart, byName] = await Promise.all([
    fetchPriorReservations('chart_no', chartNos),
    fetchPriorReservations('patient_name', names),
  ]);
  const rows = [...byChart, ...byName];

  const recordIds = [...new Set(rows.map((r) => r.daily_record_id))];
  const dateById = new Map<string, string>();
  for (let i = 0; i < recordIds.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from('daily_records')
      .select('id, date')
      .in('id', recordIds.slice(i, i + IN_CHUNK))
      .is('deleted_at', null)
      .lt('date', beforeDate);
    if (error) throw error;
    for (const r of (data ?? []) as { id: string; date: string }[]) dateById.set(r.id, r.date);
  }

  return rows.flatMap((r): PriorVisitRow[] => {
    const d = dateById.get(r.daily_record_id);
    if (!d) return [];
    return [{ date: d, patientName: r.patient_name, chartNo: r.chart_no, phone: r.phone, mobile: r.mobile }];
  });
}

interface DailyVisitRow {
  visit_date: string;
  chart_no: string;
  patient_name: string;
  doctor_name: string;
}

// 일일결산에 저장해 둔 그날 내원 환자(daily_visits). 표가 아직 없으면(SQL 실행 전) 빈 목록으로 보고 예약 명단 방식으로 넘어간다.
async function fetchDailyVisitsOn(date: string): Promise<DailyVisitRow[]> {
  const { data, error } = await supabase
    .from('daily_visits')
    .select('visit_date, chart_no, patient_name, doctor_name')
    .eq('visit_date', date)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as DailyVisitRow[];
}

// 후보들의 이전 일일결산 내원 기록(차트번호가 있는 사람은 차트번호로, 없는 사람은 이름으로).
async function fetchPriorDailyVisits(candidates: VisitCandidate[], beforeDate: string): Promise<PriorVisitRow[]> {
  const chartNos = [...new Set(candidates.map((c) => c.chartNo).filter(Boolean))];
  const namesWithoutChart = [...new Set(candidates.filter((c) => !c.chartNo).map((c) => c.patientName))];
  const out: PriorVisitRow[] = [];
  const collect = async (column: 'chart_no' | 'patient_name', values: string[]) => {
    for (let i = 0; i < values.length; i += IN_CHUNK) {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('daily_visits')
          .select('visit_date, chart_no, patient_name')
          .in(column, values.slice(i, i + IN_CHUNK))
          .lt('visit_date', beforeDate)
          .order('visit_date')
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as { visit_date: string; chart_no: string; patient_name: string }[];
        out.push(...page.map((r) => ({ date: r.visit_date, patientName: r.patient_name, chartNo: r.chart_no, phone: '', mobile: '' })));
        if (page.length < PAGE) break;
      }
    }
  };
  await collect('chart_no', chartNos);
  await collect('patient_name', namesWithoutChart);
  return out;
}


interface BaselineRow {
  chart_no: string;
  patient_name: string;
  registered_date: string | null;
  first_visit: string | null;
  last_visit: string | null;
}

interface BaselineInfo {
  /** 후보들의 가져온 내원 이력(재등록 차트 포함) */
  rows: BaselineRow[];
  /** 그날 이전에 이미 있던 차트 중 가장 큰 번호(일일결산 기록·이력표 등록일 기준) */
  maxKnownChart: number | null;
  /** 최근 3개월 내원 기록을 빠짐없이 가지고 있는가 */
  windowCovered: boolean;
}

function numericChart(chartNo: string): number | null {
  const base = baseChartNo(chartNo);
  return /^\d+$/.test(base) ? Number(base) : null;
}

// 가져온 내원 이력(patient_visit_history). 표가 없거나 비어 있으면(SQL 실행 전·아직 안 가져옴) 없는 것으로 본다.
async function loadBaseline(candidates: VisitCandidate[], date: string): Promise<BaselineInfo> {
  const empty: BaselineInfo = { rows: [], maxKnownChart: null, windowCovered: false };
  try {
    const variants = [...new Set(candidates.map((c) => baseChartNo(c.chartNo)).filter(Boolean))].flatMap((b) => [b, `${b}-1`, `${b}-2`]);
    const rows: BaselineRow[] = [];
    for (let i = 0; i < variants.length; i += IN_CHUNK) {
      const { data, error } = await supabase
        .from('patient_visit_history')
        .select('chart_no, patient_name, registered_date, first_visit, last_visit')
        .in('chart_no', variants.slice(i, i + IN_CHUNK));
      if (error) return empty;
      rows.push(...((data ?? []) as BaselineRow[]));
    }

    const periodStartRes = await supabase.from('patient_visit_history').select('period_start').not('period_start', 'is', null).order('period_start', { ascending: true }).limit(1);
    const periodEndRes = await supabase.from('patient_visit_history').select('period_end').not('period_end', 'is', null).order('period_end', { ascending: false }).limit(1);
    const periodStart = (periodStartRes.data?.[0] as { period_start: string } | undefined)?.period_start ?? null;
    const periodEnd = (periodEndRes.data?.[0] as { period_end: string } | undefined)?.period_end ?? null;
    if (!periodStart || !periodEnd) return empty;

    const registeredBefore = await supabase.from('patient_visit_history').select('chart_no').lt('registered_date', date).order('chart_no', { ascending: false }).limit(30);
    const visitsBefore = await supabase.from('daily_visits').select('chart_no, visit_date').lt('visit_date', date).order('chart_no', { ascending: false }).limit(30);
    const latestVisit = await supabase.from('daily_visits').select('visit_date').lt('visit_date', date).order('visit_date', { ascending: false }).limit(1);

    const charts = [
      ...((registeredBefore.data ?? []) as { chart_no: string }[]).map((r) => numericChart(r.chart_no)),
      ...((visitsBefore.data ?? []) as { chart_no: string }[]).map((r) => numericChart(r.chart_no)),
    ].filter((n): n is number => n !== null);
    const maxKnownChart = charts.length > 0 ? Math.max(...charts) : null;

    // 이력표 기간이 "내원일 3개월 전"부터 시작하고, 내원일 직전까지 기록이 이어져 있어야 "기록이 없다 = 3개월 안에 안 왔다"고 볼 수 있다.
    const latestRecorded = [periodEnd, (latestVisit.data?.[0] as { visit_date: string } | undefined)?.visit_date ?? ''].sort().pop() ?? periodEnd;
    const windowCovered = periodStart <= addMonthsKst(date, -3) && diffDaysKst(latestRecorded, date) <= 4;

    return { rows, maxKnownChart, windowCovered };
  } catch {
    return empty;
  }
}

async function newPatientCountOn(date: string): Promise<number | null> {
  const { data, error } = await supabase.from('daily_revenue').select('new_patient_count').eq('date', date).maybeSingle();
  if (error) return null;
  return data?.new_patient_count != null ? Number(data.new_patient_count) : null;
}

/**
 * 일일결산에 저장된 그날 내원 환자를 후보로 삼는다(실제로 온 사람만: 예약 없이 온 환자 포함, 취소·노쇼 제외).
 * 이전 내원일 = 이전 일일결산 내원 기록 + 예약 기록의 내원. 연락처는 예약 기록에서 찾을 수 있을 때만 채운다.
 * 결산표의 신규환자수 N명이면 차트번호가 가장 큰 N명을 "새 차트"로 표시한다(likelyNewChart).
 */
async function getCandidatesFromSettlement(date: string, visits: DailyVisitRow[]): Promise<FirstVisitCandidatesResult> {
  const candidates = dedupeSettlementVisits(
    visits.map((v) => ({ patientName: v.patient_name, chartNo: v.chart_no, doctorName: v.doctor_name }))
  );
  const [priorDaily, priorReservation, newCount, record, baseline] = await Promise.all([
    fetchPriorDailyVisits(candidates, date),
    loadReservationPrior(candidates, date),
    newPatientCountOn(date),
    getDailyRecordByDate(date),
    loadBaseline(candidates, date),
  ]);
  // 가져온 이력표의 "기간 중 처음/마지막 내원일"도 이전 내원일로 쓴다(내원일 이전 것만).
  const priorBaseline = baseline.rows.flatMap((r): PriorVisitRow[] =>
    [r.first_visit, r.last_visit]
      .filter((d): d is string => !!d && d < date)
      .map((d) => ({ date: d, patientName: r.patient_name, chartNo: r.chart_no, phone: '', mobile: '' }))
  );
  const prior = [...priorDaily, ...priorReservation, ...priorBaseline];

  // 연락처/예약 시간: 그날 예약 명단이 있으면 거기서, 없으면 예전 예약 기록에서 같은 차트번호의 번호를 빌린다.
  const phoneByChart = new Map<string, string>();
  const timeByChart = new Map<string, string>();
  for (const r of record?.reservations ?? []) {
    const chart = r.chartNo.trim();
    if (!chart) continue;
    const phone = (r.mobile || r.phone).trim();
    if (phone && !phoneByChart.has(chart)) phoneByChart.set(chart, phone);
    if (r.timeLabel.trim() && !timeByChart.has(chart)) timeByChart.set(chart, r.timeLabel.trim());
  }
  for (const r of priorReservation) {
    const chart = r.chartNo.trim();
    const phone = (r.mobile || r.phone).trim();
    if (chart && phone && !phoneByChart.has(chart)) phoneByChart.set(chart, phone);
  }

  const newCharts = likelyNewChartNos(
    candidates.map((c) => c.chartNo),
    newCount
  );

  return {
    date,
    source: 'settlement',
    hasRecord: true,
    closingFirstVisitCount: newCount,
    candidates: candidates.map((c) => {
      const withContact: VisitCandidate = {
        ...c,
        phone: c.chartNo ? (phoneByChart.get(c.chartNo) ?? '') : '',
        timeLabel: c.chartNo ? (timeByChart.get(c.chartNo) ?? '') : '',
      };
      const previousVisitDates = previousVisitDatesFor(withContact, prior, date);
      const { kind, reason, countedInNewCount } = classifySettlementCandidate({
        chartNo: c.chartNo,
        previousVisitDates,
        date,
        newChartNos: newCharts,
        maxKnownChart: baseline.maxKnownChart,
        registeredOnDate: baseline.rows.some((r) => r.chart_no === c.chartNo && r.registered_date === date),
        windowCovered: baseline.windowCovered,
      });
      return {
        ...withContact,
        previousVisitDates,
        possibleHomonym: hasPossibleHomonym(withContact, prior, date),
        likelyNewChart: newCharts ? newCharts.has(c.chartNo) : null,
        kind,
        kindReason: reason,
        countedInNewCount: countedInNewCount ?? false,
      };
    }),
  };
}

/**
 * 그 날짜의 후보(초진·재초진 판정 대상)와 각자의 이전 내원일을 돌려준다.
 * 일일결산의 내원 환자 명단이 저장돼 있으면 그것을, 없으면 그 날짜 예약 명단(취소 제외, 중복 예약은 하나)을 쓴다.
 * 이전 내원 = 그 날짜보다 앞선 기록에서 같은 사람의 내원. 같은 사람 판단은 firstVisit.ts 의 isSamePatient(차트번호, 없으면 이름+전화).
 */
export async function getFirstVisitCandidates(date: string): Promise<FirstVisitCandidatesResult> {
  const visits = await fetchDailyVisitsOn(date);
  if (visits.length > 0) return getCandidatesFromSettlement(date, visits);

  const record = await getDailyRecordByDate(date);
  if (!record) return { date, source: 'reservation', hasRecord: false, closingFirstVisitCount: null, candidates: [] };

  const candidates = dedupeVisitCandidates(record.reservations);
  const prior = await loadReservationPrior(candidates, date);

  return {
    date,
    source: 'reservation',
    hasRecord: true,
    closingFirstVisitCount: record.firstVisitCount,
    candidates: candidates.map((c) => ({
      ...c,
      previousVisitDates: previousVisitDatesFor(c, prior, date),
      possibleHomonym: hasPossibleHomonym(c, prior, date),
    })),
  };
}
