import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeDerivedStats } from './reservationStats';
import type { DailyRecordFull, DailyRecordSummary, Reservation } from './types';

// 예약관리 테이블(daily_records/reservations)은 RLS가 로그인 사용자도 막아둔 구조라
// admin(service_role) 클라이언트로만 접근한다 — 호출하는 API 라우트가 로그인/승인을 확인한다.
const supabase = createAdminClient();

interface DailyRecordRow {
  id: string;
  date: string;
  memo_text: string;
  visit_count: number | null;
  reservation_count: number | null;
  excluded_count: number | null;
  excluded_names: string[] | null;
  chuna_count: number | null;
  chuna_names: string[] | null;
  nogyong_count: number | null;
  ilban_count: number | null;
  first_visit_count: number | null;
  parse_warnings: string[] | null;
  diet_count: number;
  special_acupuncture_count: number;
}

interface ReservationRow {
  id: string;
  daily_record_id: string;
  doctor_name: string;
  time_label: string;
  patient_name: string;
  chart_no: string;
  phone: string;
  mobile: string;
  visit_status: string;
  treatment_area: string;
  treatment: string;
  special_notes: string;
  memo: string;
}

function toSummary(row: DailyRecordRow, reservationRowCount: number): DailyRecordSummary {
  return {
    id: row.id,
    date: row.date,
    memoText: row.memo_text,
    visitCount: row.visit_count,
    // 멘트에서 파싱한 값 — 대시보드 예약률 계산에 쓰인다 (computeWeeklyStats 참고).
    reservationCount: row.reservation_count,
    // 예약자 명단 테이블의 실제 행 수 — 사이드바 표시용. 명단을 고쳐도 마감
    // 멘트를 다시 저장하지 않으면 위 reservationCount와 어긋날 수 있어 분리했다.
    reservationRowCount,
    excludedCount: row.excluded_count,
    chunaCount: row.chuna_count,
    nogyongCount: row.nogyong_count,
    ilbanCount: row.ilban_count,
    firstVisitCount: row.first_visit_count,
    dietCount: row.diet_count,
    specialAcupunctureCount: row.special_acupuncture_count,
  };
}

function toReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    dailyRecordId: row.daily_record_id,
    doctorName: row.doctor_name,
    timeLabel: row.time_label,
    patientName: row.patient_name,
    chartNo: row.chart_no,
    phone: row.phone,
    mobile: row.mobile,
    visitStatus: row.visit_status,
    treatmentArea: row.treatment_area,
    treatment: row.treatment,
    specialNotes: row.special_notes,
    memo: row.memo,
  };
}

export async function listDailyRecords(): Promise<DailyRecordSummary[]> {
  const { data, error } = await supabase
    .from('daily_records')
    .select('*')
    .is('deleted_at', null)
    .order('date', { ascending: false });
  if (error) throw error;

  const records = data ?? [];
  if (records.length === 0) return [];

  const { data: reservationRows, error: reservationError } = await supabase
    .from('reservations')
    .select('daily_record_id')
    .in(
      'daily_record_id',
      records.map((record) => record.id)
    );
  if (reservationError) throw reservationError;

  const rowCountByRecordId = new Map<string, number>();
  for (const row of reservationRows ?? []) {
    rowCountByRecordId.set(
      row.daily_record_id,
      (rowCountByRecordId.get(row.daily_record_id) ?? 0) + 1
    );
  }

  return records.map((record) => toSummary(record, rowCountByRecordId.get(record.id) ?? 0));
}

export async function getDailyRecordByDate(date: string): Promise<DailyRecordFull | null> {
  const { data: record, error } = await supabase
    .from('daily_records')
    .select('*')
    .eq('date', date)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!record) return null;

  const { data: reservationRows, error: reservationError } = await supabase
    .from('reservations')
    .select('*')
    .eq('daily_record_id', record.id)
    .order('time_label', { ascending: true });
  if (reservationError) throw reservationError;

  return {
    ...toSummary(record, reservationRows?.length ?? 0),
    excludedNames: record.excluded_names ?? [],
    chunaNames: record.chuna_names ?? [],
    parseWarnings: record.parse_warnings ?? [],
    reservations: (reservationRows ?? []).map(toReservation),
  };
}

export async function ensureDailyRecord(date: string): Promise<string> {
  const { data, error } = await supabase
    .from('daily_records')
    .upsert({ date }, { onConflict: 'date', ignoreDuplicates: false })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

// 그 날짜의 예약 명단을 통째로 대체한다. 지우기+넣기는 DB 함수 replace_reservations 안에서
// 한 트랜잭션으로 처리한다(중간에 실패해도 예전 명단이 그대로 남는다). 그 날짜의
// daily_records 행이 없으면 함수가 만든다. 함수는 service_role 만 실행할 수 있다.
//
// 마감 멘트 없이도 예약률/부도취소율/추나 통계가 나오도록, 명단을 저장할 때마다
// 그 자리에서 다시 계산해 daily_records에 반영한다(reservationStats.ts 참고).
// 녹용/일반 한약·다이어트·초진 수는 명단만으로는 못 가려서 손대지 않는다 — 마지막
// 저장된 값이 그대로 남는다. 통계 갱신은 대체와 별개 요청이지만 명단에서 다시 계산하는
// 값이라 실패하면 같은 저장을 다시 하면 된다.
export async function replaceReservationsForDate(date: string, rows: Reservation[]): Promise<string> {
  const { data: dailyRecordId, error: rpcError } = await supabase.rpc('replace_reservations', {
    p_date: date,
    p_rows: rows.map((row) => ({
      doctor_name: row.doctorName,
      time_label: row.timeLabel,
      patient_name: row.patientName,
      chart_no: row.chartNo,
      phone: row.phone,
      mobile: row.mobile,
      visit_status: row.visitStatus,
      treatment_area: row.treatmentArea,
      treatment: row.treatment,
      special_notes: row.specialNotes,
      memo: row.memo,
    })),
  });
  if (rpcError) throw rpcError;
  if (typeof dailyRecordId !== 'string') throw new Error('예약 명단을 대체하지 못했습니다.');

  const stats = computeDerivedStats(rows);
  const { error: statsError } = await supabase
    .from('daily_records')
    .update({
      visit_count: stats.visitCount,
      reservation_count: stats.reservationCount,
      excluded_count: stats.excludedCount,
      excluded_names: stats.excludedNames,
      chuna_count: stats.chunaCount,
      chuna_names: stats.chunaNames,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dailyRecordId);
  if (statsError) throw statsError;
  return dailyRecordId;
}

export async function replaceReservations(
  dailyRecordId: string,
  rows: Reservation[]
): Promise<void> {
  const { data: record, error } = await supabase
    .from('daily_records')
    .select('date')
    .eq('id', dailyRecordId)
    .maybeSingle();
  if (error) throw error;
  if (!record) throw new Error('해당 날짜의 기록을 찾을 수 없습니다.');
  await replaceReservationsForDate(record.date, rows);
}

// 날짜별 현재 저장된 예약 명단 인원수(붙여넣기 저장 전 "기존 N명 → 새 N명" 확인용). 읽기 전용.
export async function countReservationsByDates(dates: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(dates.map((d) => [d, 0]));
  if (dates.length === 0) return counts;

  const { data: records, error } = await supabase
    .from('daily_records')
    .select('id, date')
    .in('date', dates)
    .is('deleted_at', null);
  if (error) throw error;
  if (!records || records.length === 0) return counts;

  const dateById = new Map(records.map((r) => [r.id as string, r.date as string]));
  const { data: rows, error: rowsError } = await supabase
    .from('reservations')
    .select('daily_record_id')
    .in('daily_record_id', [...dateById.keys()]);
  if (rowsError) throw rowsError;
  for (const row of rows ?? []) {
    const d = dateById.get(row.daily_record_id);
    if (d) counts[d] += 1;
  }
  return counts;
}
