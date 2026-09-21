import type { SupabaseClient } from '@supabase/supabase-js';
import type { ManualCallType } from '@/lib/happyCallQueue';

// --- 수동 콜(직접 추가 / 비급여 구매에서 자동 생성) ---

export async function createManualEntry(
  supabase: SupabaseClient,
  input: {
    patientName: string;
    note: string;
    callDate: string;
    createdBy: string | null;
    /** 초진/한약/린다이어트/비급여/기타 — 목록의 "유형"에 나온다 */
    callType?: ManualCallType | null;
    phone?: string | null;
  }
): Promise<string> {
  const base = {
    patient_name: input.patientName,
    note: input.note || null,
    call_date: input.callDate,
    created_by: input.createdBy,
  };
  const withType = { ...base, call_type: input.callType ?? null, phone: input.phone?.trim() || null };
  let { data, error } = await supabase.from('happy_call_manual_entries').insert(withType).select('id').single();
  // 종류·연락처 칸을 만드는 SQL(migration_manual_call_types.sql)을 아직 실행하지 않았어도 콜은 만들어지도록, 그 칸만 빼고 한 번 더 시도한다.
  if (error && /call_type|phone/.test(error.message)) {
    ({ data, error } = await supabase.from('happy_call_manual_entries').insert(base).select('id').single());
  }
  if (error || !data) throw error ?? new Error('insert failed');
  return data.id;
}

/**
 * 직접 추가한 콜을 지운다(아직 시도 기록이 없는 콜만). 비급여 구매에 연결된 콜은 외래키 때문에 지워지지 않으므로
 * false 를 돌려주고, 화면이 "비급여 현황에서 고치세요"라고 안내한다.
 */
export async function deleteUntouchedManualEntry(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('happy_call_manual_entries')
    .delete()
    .eq('id', id)
    .eq('done', false)
    .eq('attempts', 0)
    .select('id');
  if (error) return false; // 23503: 비급여 구매가 이 콜을 가리키고 있다
  return (data ?? []).length > 0;
}

export interface ManualEntryState {
  id: string;
  callDate: string;
  note: string | null;
  /** 종료됨(통화완료/거부/연락 안 됨 등) */
  closed: boolean;
  attempts: number;
}

/** 수동 콜 여러 개의 현재 상태(비급여 구매의 콜을 다시 맞출 때 읽는다). */
export async function getManualEntryStates(supabase: SupabaseClient, ids: string[]): Promise<ManualEntryState[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('happy_call_manual_entries')
    .select('id, call_date, note, done, attempts')
    .in('id', ids);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    callDate: r.call_date as string,
    note: (r.note as string | null) ?? null,
    closed: Boolean(r.done),
    attempts: (r.attempts as number | null) ?? 0,
  }));
}

/**
 * 아직 종료도 시도도 하지 않은 콜의 날짜/문구를 고친다. 그 사이 다른 직원이 처리했다면 건드리지 않고
 * false 를 돌려준다(끝난 콜을 덮어쓰지 않기 위해).
 */
export async function updateUntouchedManualEntry(
  supabase: SupabaseClient,
  id: string,
  patch: { callDate: string; note: string }
): Promise<boolean> {
  const { data, error } = await supabase
    .from('happy_call_manual_entries')
    .update({ call_date: patch.callDate, note: patch.note })
    .eq('id', id)
    .eq('done', false)
    .eq('attempts', 0)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * 아직 열려 있는(done=false) 콜을 지운다. 이미 끝난 콜은 기록이므로 남긴다.
 * onlyUntouched 이면 시도 기록이 없는 콜만 지운다.
 * DELETE 정책(migration_manual_entries_delete.sql)이 아직 없어 행이 안 지워지면(RLS는 에러 없이 0행),
 * 그 콜이 목록에 계속 남지 않도록 "취소됨"으로 닫는다.
 */
export async function removeOpenManualEntries(
  supabase: SupabaseClient,
  ids: string[],
  options: { onlyUntouched?: boolean } = {}
): Promise<void> {
  if (ids.length === 0) return;
  const table = 'happy_call_manual_entries';

  let del = supabase.from(table).delete().in('id', ids).eq('done', false);
  if (options.onlyUntouched) del = del.eq('attempts', 0);
  const { error } = await del;
  if (error) throw error;

  let check = supabase.from(table).select('id').in('id', ids).eq('done', false);
  if (options.onlyUntouched) check = check.eq('attempts', 0);
  const { data: remaining, error: readError } = await check;
  if (readError) throw readError;
  const leftover = ((remaining ?? []) as { id: string }[]).map((r) => r.id);
  if (leftover.length === 0) return;

  let close = supabase
    .from(table)
    .update({ done: true, done_note: '비급여 구매 기록 변경으로 취소됨' })
    .in('id', leftover)
    .eq('done', false);
  if (options.onlyUntouched) close = close.eq('attempts', 0);
  const { error: closeError } = await close;
  if (closeError) throw closeError;
}

/**
 * 아직 열려 있는(done=false) 콜의 환자 이름을 바꾼다(비급여 구매의 환자 이름을 고쳤을 때).
 * 이미 끝난 콜은 통화 기록이라 이름도 그대로 둔다.
 */
export async function renameOpenManualEntries(supabase: SupabaseClient, ids: string[], patientName: string): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('happy_call_manual_entries')
    .update({ patient_name: patientName })
    .in('id', ids)
    .eq('done', false);
  if (error) throw error;
}
