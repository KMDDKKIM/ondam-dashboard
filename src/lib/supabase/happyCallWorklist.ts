import type { SupabaseClient } from '@supabase/supabase-js';
import { listFirstVisitCallCandidates } from './happyCallPatients';
import { baseChartNo } from '@/lib/firstVisit';
import {
  applyCallAction,
  buildWorklist,
  CALL_RESULT_LABEL,
  firstVisitProgress,
  isClosedResult,
  postponeCall,
  undoCallAction,
  type CallAction,
  type CallProgress,
  type CallResult,
  type Worklist,
  type WorklistItem,
} from '@/lib/happyCallQueue';

// 네 가지 콜 출처(초진 / 한약 / 린다이어트 / 수동·비급여)를 하나의 WorklistItem 목록으로
// 읽고, 결과 기록·미루기·되돌리기를 각 출처의 컬럼에 써 넣는다.
// 규칙 자체(재시도, 미루기, 연체)는 src/lib/happyCallQueue.ts 의 순수 함수가 정한다.

/** 다른 직원이 먼저 같은 콜을 처리해서 화면의 상태가 낡았을 때. */
export class CallConflictError extends Error {
  constructor() {
    super('call state changed');
    this.name = 'CallConflictError';
  }
}

interface CallColumns {
  table: string;
  due: string;
  /** 첫 부재중으로 예정일을 옮기기 전의 원래 예정일(되돌리기용) */
  originalDue: string;
  attempts: string;
  result: string;
  /** 종료 여부 boolean 컬럼. 초진은 없다(결과값으로 판단). */
  done: string | null;
  memo: string;
  by: string;
  at: string;
}

function columnsFor(item: Pick<WorklistItem, 'kind' | 'callNumber'>): CallColumns {
  switch (item.kind) {
    case 'firstVisit':
      return {
        table: 'happy_call_patients',
        due: 'call_due_date',
        originalDue: 'call_original_due',
        attempts: 'call_attempts',
        result: 'call_result',
        done: null,
        memo: 'call_memo',
        by: 'call_completed_by',
        at: 'call_completed_at',
      };
    case 'herb': {
      const n = item.callNumber ?? 1;
      return {
        table: 'herb_medicine_prescriptions',
        due: `call_date_${n}`,
        originalDue: `call_${n}_original_due`,
        attempts: `call_${n}_attempts`,
        result: `call_${n}_result`,
        done: `call_${n}_done`,
        memo: `call_${n}_note`,
        by: `call_${n}_completed_by`,
        at: `call_${n}_completed_at`,
      };
    }
    case 'diet':
      return {
        table: 'diet_package_calls',
        due: 'call_date',
        originalDue: 'original_due',
        attempts: 'attempts',
        result: 'result',
        done: 'done',
        memo: 'note',
        by: 'completed_by',
        at: 'completed_at',
      };
    case 'manual':
      return {
        table: 'happy_call_manual_entries',
        due: 'call_date',
        originalDue: 'original_due',
        attempts: 'attempts',
        result: 'result',
        done: 'done',
        memo: 'done_note',
        by: 'completed_by',
        at: 'completed_at',
      };
  }
}

// --- 읽기 ---

function resultOf(raw: CallResult | null, done: boolean): CallResult | null {
  // 결과 기능 이전에 "완료"로만 표시된 옛 행은 통화완료로 본다.
  if (raw) return raw;
  return done ? 'answered' : null;
}

interface HerbRow {
  id: string;
  patient_name: string;
  [column: string]: unknown;
}

function herbItems(row: HerbRow): WorklistItem[] {
  return ([1, 2, 3] as const).map((n) => {
    const done = Boolean(row[`call_${n}_done`]);
    const result = resultOf((row[`call_${n}_result`] as CallResult | null) ?? null, done);
    return {
      key: `herb-${row.id}-${n}`,
      kind: 'herb' as const,
      id: row.id,
      callNumber: n,
      patientName: row.patient_name,
      phone: null,
      doctorStaffId: null,
      dueDate: row[`call_date_${n}`] as string,
      originalDue: (row[`call_${n}_original_due`] as string | null) ?? null,
      attempts: (row[`call_${n}_attempts`] as number | null) ?? 0,
      result,
      closed: done,
      memo: (row[`call_${n}_note`] as string | null) ?? null,
      note: null,
      callType: null,
      completedBy: (row[`call_${n}_completed_by`] as string | null) ?? null,
      completedAt: (row[`call_${n}_completed_at`] as string | null) ?? null,
    };
  });
}

interface SimpleCallRow {
  id: string;
  call_date: string;
  original_due: string | null;
  done: boolean;
  attempts: number | null;
  result: CallResult | null;
  completed_by: string | null;
  completed_at: string | null;
}

interface DietCallRow extends SimpleCallRow {
  note: string | null;
  diet_packages: { patient_name: string } | null;
}

interface ManualRow extends SimpleCallRow {
  patient_name: string;
  note: string | null;
  done_note: string | null;
  call_type?: string | null;
  phone?: string | null;
}

function usablePhone(phone: string | null | undefined): string | null {
  const p = (phone ?? '').trim();
  // "010-" 처럼 앞자리만 적힌 번호는 걸 수 없으니 쓰지 않는다.
  return p.replace(/\D/g, '').length >= 9 ? p : null;
}

/**
 * 비급여 구매에서 만든 수동 콜(해피콜 행 id)의 연락처를 찾는다. 구매에 연락처가 적혀 있으면 그것을,
 * 없으면(비급여 현황에는 연락처를 받지 않는다) 그 차트번호로 가져온 내원 이력(patient_visit_history)에서 찾는다.
 * 어디에도 없으면 그냥 "-"로 둔다.
 */
async function phonesByManualEntryId(supabase: SupabaseClient, entryIds: string[]): Promise<Map<string, string>> {
  const phones = new Map<string, string>();
  const chartByEntry = new Map<string, string>();
  const columns = ['happy_call_entry_id', 'happy_call_entry_id_2', 'happy_call_entry_id_3'] as const;
  for (let i = 0; i < entryIds.length; i += 50) {
    const chunk = entryIds.slice(i, i + 50);
    for (const column of columns) {
      const { data, error } = await supabase.from('non_covered_purchases').select(`phone, chart_no, ${column}`).in(column, chunk);
      if (error || !data) continue;
      for (const row of data as unknown as Record<string, string | null>[]) {
        const entryId = row[column];
        if (!entryId) continue;
        const own = usablePhone(row.phone);
        if (own) phones.set(entryId, own);
        else if (row.chart_no) chartByEntry.set(entryId, row.chart_no);
      }
    }
  }

  const wanted = [...new Set([...chartByEntry.values()].flatMap((c) => [c, baseChartNo(c)]))];
  if (wanted.length > 0) {
    const byChart = new Map<string, string>();
    for (let i = 0; i < wanted.length; i += 100) {
      const { data, error } = await supabase.from('patient_visit_history').select('chart_no, phone').in('chart_no', wanted.slice(i, i + 100));
      if (error || !data) break;
      for (const r of data as { chart_no: string; phone: string | null }[]) {
        const p = usablePhone(r.phone);
        if (p) byChart.set(r.chart_no, p);
      }
    }
    for (const [entryId, chart] of chartByEntry) {
      const found = byChart.get(chart) ?? byChart.get(baseChartNo(chart));
      if (found && !phones.has(entryId)) phones.set(entryId, found);
    }
  }
  return phones;
}

/**
 * 오늘 목록에 필요한 콜 전부(예정일 ≤ 오늘인 미완료 + 오늘 결과를 기록한 콜)를 네 출처에서 읽는다.
 * 하나라도 실패하면 throw 한다 — 호출한 화면이 오류를 보여 줘야 하며 "대상 없음"으로 보이면 안 된다.
 */
export async function loadWorklist(supabase: SupabaseClient, today: string): Promise<Worklist> {
  // 오늘 0시(한국)부터 기록된 결과를 "오늘 처리한 콜"로 본다.
  const since = new Date(`${today}T00:00:00+09:00`).toISOString();

  const herbQuery = supabase
    .from('herb_medicine_prescriptions')
    .select('*')
    .or(
      [1, 2, 3]
        .map((n) => `call_${n}_done.eq.false`)
        .concat([1, 2, 3].map((n) => `call_${n}_completed_at.gte.${since}`))
        .join(',')
    );
  const dietQuery = supabase
    .from('diet_package_calls')
    .select('id, call_date, original_due, done, note, attempts, result, completed_by, completed_at, diet_packages(patient_name)')
    .or(`done.eq.false,completed_at.gte.${since}`);
  const manualQuery = supabase
    .from('happy_call_manual_entries')
    .select('*')
    .or(`done.eq.false,completed_at.gte.${since}`);

  const [herb, diet, manual, patients] = await Promise.all([
    herbQuery,
    dietQuery,
    manualQuery,
    listFirstVisitCallCandidates(supabase, since),
  ]);
  if (herb.error) throw herb.error;
  if (diet.error) throw diet.error;
  if (manual.error) throw manual.error;

  const manualRows = (manual.data ?? []) as ManualRow[];
  const phones = await phonesByManualEntryId(
    supabase,
    manualRows.map((m) => m.id)
  );

  const items: WorklistItem[] = [
    ...patients.map((p): WorklistItem => {
      const progress = firstVisitProgress(p);
      return {
        key: `firstVisit-${p.id}`,
        kind: 'firstVisit',
        id: p.id,
        patientName: p.patientName,
        phone: p.phone ?? null,
        doctorStaffId: p.doctorStaffId,
        dueDate: progress.dueDate,
        originalDue: progress.originalDue,
        attempts: progress.attempts,
        result: progress.result,
        closed: progress.closed,
        memo: p.callMemo ?? null,
        note: null,
        callType: null,
        completedBy: p.callCompletedBy ?? null,
        completedAt: p.callCompletedAt ?? null,
      };
    }),
    ...((herb.data ?? []) as HerbRow[]).flatMap(herbItems),
    ...((diet.data ?? []) as unknown as DietCallRow[]).map(
      (c): WorklistItem => ({
        key: `diet-${c.id}`,
        kind: 'diet',
        id: c.id,
        patientName: c.diet_packages?.patient_name ?? '-',
        phone: null,
        doctorStaffId: null,
        dueDate: c.call_date,
        originalDue: c.original_due,
        attempts: c.attempts ?? 0,
        result: resultOf(c.result, c.done),
        closed: c.done,
        memo: c.note,
        note: null,
        callType: null,
        completedBy: c.completed_by,
        completedAt: c.completed_at,
      })
    ),
    ...manualRows.map(
      (m): WorklistItem => ({
        key: `manual-${m.id}`,
        kind: 'manual',
        id: m.id,
        patientName: m.patient_name,
        phone: m.phone ?? phones.get(m.id) ?? null,
        doctorStaffId: null,
        dueDate: m.call_date,
        originalDue: m.original_due,
        attempts: m.attempts ?? 0,
        result: resultOf(m.result, m.done),
        closed: m.done,
        memo: m.done_note,
        note: m.note,
        callType: m.call_type ?? null,
        completedBy: m.completed_by,
        completedAt: m.completed_at,
      })
    ),
  ];

  return buildWorklist(items, today);
}

/**
 * id -> 이름 (진료의/완료자 표시용). 직원 이름에 더해 진료의 목록(계정이 없는 진료의 포함)도 넣는다.
 * doctors 테이블이 아직 없어도(마이그레이션 전) 직원 이름만으로 동작한다.
 */
export async function listStaffNames(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('staff').select('id, name').eq('status', 'approved');
  if (error) throw error;
  const names: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; name: string }[]) names[row.id] = row.name;

  const doctors = await supabase.from('doctors').select('id, name');
  if (!doctors.error) {
    for (const row of (doctors.data ?? []) as { id: string; name: string }[]) {
      if (!(row.id in names)) names[row.id] = row.name;
    }
  }
  return names;
}

// --- 쓰기 ---

function progressPatch(cols: CallColumns, next: CallProgress): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    [cols.due]: next.dueDate,
    [cols.originalDue]: next.originalDue,
    [cols.attempts]: next.attempts,
    [cols.result]: next.result,
  };
  if (cols.done) patch[cols.done] = next.closed;
  return patch;
}

// 화면에 떠 있는 동안 다른 직원이 같은 콜을 처리했을 수 있으므로, 읽었을 때의 attempts 가
// 그대로일 때만 갱신한다. 0행이 갱신되면 CallConflictError.
async function updateCall(
  supabase: SupabaseClient,
  item: WorklistItem,
  cols: CallColumns,
  patch: Record<string, unknown>
): Promise<void> {
  const { data, error } = await supabase
    .from(cols.table)
    .update(patch)
    .eq('id', item.id)
    .eq(cols.attempts, item.attempts)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new CallConflictError();
}

/**
 * 초진 콜은 종료 시 기존 "통화내역(call_log)"에도 한 줄 남겨 초진 등록 화면과 맞춘다.
 * 단 직원이 등록 화면에 이미 적어 둔 통화내역은 덮어쓰지 않고(비어 있을 때만 쓴다),
 * 되돌릴 때도 이 함수가 만든 문구와 똑같을 때만 지운다 — 직원이 직접 쓴 내용은 건드리지 않는다.
 */
function firstVisitCallLog(result: CallResult, memo: string): string {
  const label = CALL_RESULT_LABEL[result];
  return memo ? `${label}: ${memo}` : label;
}

export async function recordCallResult(
  supabase: SupabaseClient,
  item: WorklistItem,
  action: CallAction,
  options: { memo: string; staffId: string | null; today: string; now?: Date }
): Promise<void> {
  const cols = columnsFor(item);
  const next = applyCallAction(item, action, options.today);
  const memo = options.memo.trim();
  const patch: Record<string, unknown> = {
    ...progressPatch(cols, next),
    [cols.memo]: memo || null,
    [cols.by]: options.staffId,
    [cols.at]: (options.now ?? new Date()).toISOString(),
  };
  await updateCall(supabase, item, cols, patch);
  if (item.kind === 'firstVisit' && next.result && isClosedResult(next.result)) {
    // 통화내역 한 줄은 편의 기능이라 실패해도 결과 기록 자체는 유효하다(에러로 만들지 않는다).
    await supabase
      .from('happy_call_patients')
      .update({ call_log: firstVisitCallLog(next.result, memo) })
      .eq('id', item.id)
      .is('call_log', null);
  }
}

export async function postponeCallToTomorrow(supabase: SupabaseClient, item: WorklistItem, today: string): Promise<void> {
  const cols = columnsFor(item);
  const next = postponeCall(item, today);
  await updateCall(supabase, item, cols, progressPatch(cols, next));
}

export async function undoCallResult(supabase: SupabaseClient, item: WorklistItem, today: string): Promise<void> {
  const cols = columnsFor(item);
  const next = undoCallAction(item, today);
  const patch: Record<string, unknown> = {
    ...progressPatch(cols, next),
    [cols.by]: null,
    [cols.at]: null,
  };
  // 종료하면서 우리가 남긴 통화내역 한 줄만 지운다(다시 열린 콜이 "통화 완료"로 남지 않도록).
  // 문구가 다르면 직원이 직접 적은 것이므로 그대로 둔다. 결과 기록 갱신보다 먼저 지워서, 갱신이
  // 실패해도 "종료됐는데 통화내역만 사라진" 쪽으로만 어긋나게 한다.
  if (item.kind === 'firstVisit' && item.closed && item.result) {
    const { error } = await supabase
      .from('happy_call_patients')
      .update({ call_log: null })
      .eq('id', item.id)
      .eq('call_log', firstVisitCallLog(item.result, item.memo ?? ''));
    if (error) throw error;
  }
  await updateCall(supabase, item, cols, patch);
}
