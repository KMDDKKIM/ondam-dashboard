import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  dedupeVisitCandidates,
  previousVisitDatesFor,
  type FirstVisitCandidatesResult,
  type PriorVisitRow,
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

/**
 * 그 날짜 예약 명단에서 온 사람(취소 제외, 중복 예약은 하나)과 각자의 이전 내원일을 돌려준다.
 * 이전 내원 = 그 날짜보다 앞선 날짜의 명단에서 "내원"으로 표시된 같은 사람의 예약.
 * 같은 사람 판단은 firstVisit.ts 의 isSamePatient(차트번호, 없으면 이름+전화).
 */
export async function getFirstVisitCandidates(date: string): Promise<FirstVisitCandidatesResult> {
  const record = await getDailyRecordByDate(date);
  if (!record) return { date, hasRecord: false, closingFirstVisitCount: null, candidates: [] };

  const candidates = dedupeVisitCandidates(record.reservations);
  const chartNos = [...new Set(candidates.map((c) => c.chartNo).filter(Boolean))];
  const names = [...new Set(candidates.map((c) => c.patientName))];

  let prior: PriorVisitRow[] = [];
  if (candidates.length > 0) {
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
        .lt('date', date);
      if (error) throw error;
      for (const r of (data ?? []) as { id: string; date: string }[]) dateById.set(r.id, r.date);
    }

    prior = rows.flatMap((r): PriorVisitRow[] => {
      const d = dateById.get(r.daily_record_id);
      if (!d) return [];
      return [{ date: d, patientName: r.patient_name, chartNo: r.chart_no, phone: r.phone, mobile: r.mobile }];
    });
  }

  return {
    date,
    hasRecord: true,
    closingFirstVisitCount: record.firstVisitCount,
    candidates: candidates.map((c) => ({ ...c, previousVisitDates: previousVisitDatesFor(c, prior, date) })),
  };
}
