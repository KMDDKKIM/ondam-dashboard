import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { getDailyRecordByDate } from '@/lib/reservations/dailyRecords.server';
import { buildCsv, type CsvValue } from '@/lib/csv';
import { getExportDataset, parseMonth, type MonthRange, type TableDataset } from '@/lib/backupExport';
import { fetchAllPages } from '@/lib/fetchAllPages';
import { todayKst } from '@/lib/kst';

// 대표원장 전용 백업(CSV 내려받기). GET /api/export?table=<자료 이름>&month=<YYYY-MM>
// 자료 이름은 backupExport.ts 의 목록에 있는 것만 받고, 열도 그 목록에 적힌 것만 조회한다.
// 주민등록번호 자료(remote_consult_rrn*)는 어떤 경우에도 내보내지 않는다.

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

// 한 번에 주는 행 수 상한과 상관없이, 전체 개수(count)만큼 다 받을 때까지 나눠서 읽는다.
function fetchAllRows(supabase: SupabaseClient, ds: TableDataset, range: MonthRange | null): Promise<Row[]> {
  const select = ds.columns.map((c) => c.key).join(',');
  return fetchAllPages<Row>(async (from, to) => {
    let query = supabase.from(ds.table).select(select, { count: 'exact' });
    if (ds.monthColumn && range) query = query.gte(ds.monthColumn, range.from).lt(ds.monthColumn, range.to);
    for (const col of ds.orderBy) query = query.order(col, { ascending: true });
    const { data, error, count } = await query.range(from, to);
    return { data: data as unknown as Row[] | null, error, count };
  });
}

async function loadStaffNames(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('staff').select('id, name');
  if (error) throw error;
  return new Map((data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]));
}

// 일일 결산: 결산표(daily_revenue) + 예약관리 쪽 그날 기록(daily_records)을 날짜로 합친다.
async function loadDailyClosing(supabase: SupabaseClient, range: MonthRange): Promise<Row[]> {
  const base = 'date, total_revenue, visit_count, reservation_count, kept_count, noshow_count, cancel_count, next_booking_count, chuna_count, excluded_count, source';
  let res = await supabase
    .from('daily_revenue')
    .select(`${base}, new_patient_count`)
    .gte('date', range.from)
    .lt('date', range.to)
    .order('date', { ascending: true });
  // 신규환자수 칸을 만드는 SQL(migration_daily_visits.sql)을 아직 실행하지 않은 DB 에서도 내려받을 수 있게 한다.
  if (res.error && /new_patient_count/.test(res.error.message)) {
    res = (await supabase
      .from('daily_revenue')
      .select(base)
      .gte('date', range.from)
      .lt('date', range.to)
      .order('date', { ascending: true })) as unknown as typeof res;
  }
  if (res.error) throw res.error;
  const revenueByDate = new Map((res.data as unknown as Row[]).map((r) => [r.date as string, r]));
  const records = await Promise.all(range.dates.map((d) => getDailyRecordByDate(d)));

  const rows: Row[] = [];
  range.dates.forEach((date, i) => {
    const rev = revenueByDate.get(date);
    const rec = records[i];
    if (!rev && !rec) return;
    rows.push({
      ...(rev ?? {}),
      date,
      nogyongCount: rec?.nogyongCount ?? null,
      ilbanCount: rec?.ilbanCount ?? null,
      dietCount: rec?.dietCount ?? null,
      specialAcupunctureCount: rec?.specialAcupunctureCount ?? null,
      memoText: rec?.memoText ?? null,
    });
  });
  return rows;
}

// 예약 명단: 예약관리 앱 테이블이라 기존 서버 도우미(getDailyRecordByDate)로 날짜별로 읽는다.
async function loadReservations(range: MonthRange): Promise<Row[]> {
  const records = await Promise.all(range.dates.map((d) => getDailyRecordByDate(d)));
  const rows: Row[] = [];
  records.forEach((rec, i) => {
    for (const r of rec?.reservations ?? []) {
      rows.push({
        date: range.dates[i],
        doctorName: r.doctorName,
        timeLabel: r.timeLabel,
        patientName: r.patientName,
        chartNo: r.chartNo,
        phone: r.phone,
        mobile: r.mobile,
        visitStatus: r.visitStatus,
        treatmentArea: r.treatmentArea,
        treatment: r.treatment,
        specialNotes: r.specialNotes,
        memo: r.memo,
      });
    }
  });
  return rows;
}

function toCsvValue(value: unknown): CsvValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

export async function GET(request: NextRequest) {
  // 가장 먼저 대표원장인지 확인한다(로그인 안 됨 401, 대표원장 아님 403).
  const denied = await requireOwner();
  if (denied) return denied;

  const table = request.nextUrl.searchParams.get('table');
  const month = request.nextUrl.searchParams.get('month');

  const ds = getExportDataset(table);
  if (!table || !ds) {
    return NextResponse.json({ error: '내려받을 수 없는 자료입니다.' }, { status: 400 });
  }
  let range: MonthRange | null = null;
  if (ds.monthly) {
    range = parseMonth(month);
    if (!range) {
      return NextResponse.json({ error: '월은 2026-09 처럼 입력해 주세요.' }, { status: 400 });
    }
  }

  try {
    const supabase = await createClient();
    let rows: Row[];
    if (table === 'reservations') rows = await loadReservations(range!);
    else if (table === 'daily_closing') rows = await loadDailyClosing(supabase, range!);
    else if (ds.table) rows = await fetchAllRows(supabase, ds, range);
    else throw new Error(`no loader for ${table}`);

    if (ds.columns.some((c) => c.staff)) {
      const names = await loadStaffNames(supabase);
      for (const row of rows) {
        for (const c of ds.columns) {
          if (!c.staff) continue;
          const id = row[c.key];
          // 퇴사 등으로 직원 정보가 지워졌으면 이름 대신 빈 칸
          row[c.key] = typeof id === 'string' ? (names.get(id) ?? '') : null;
        }
      }
    }

    const csv = buildCsv(
      ds.columns.map((c) => c.header),
      rows.map((row) => ds.columns.map((c) => toCsvValue(row[c.key])))
    );
    const filename = `ondam-${table}${range ? `-${month}` : ''}-${todayKst()}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[export] failed', table, err);
    return NextResponse.json({ error: '내려받기에 실패했습니다. 잠시 뒤 다시 시도해 주세요.' }, { status: 500 });
  }
}
