import type { SupabaseClient } from '@supabase/supabase-js';
import { computeHerbCallDates, computeDietCallDates } from '@/lib/happyCallStats';
import type { DietPackage } from '@/lib/types';

// --- 한약 처방 ---

export async function createHerbPrescription(
  supabase: SupabaseClient,
  input: { patientName: string; pickupDate: string; durationDays: number; createdBy: string | null }
): Promise<void> {
  const { callDate1, callDate2, callDate3 } = computeHerbCallDates(input.pickupDate, input.durationDays);
  const { error } = await supabase.from('herb_medicine_prescriptions').insert({
    patient_name: input.patientName,
    pickup_date: input.pickupDate,
    duration_days: input.durationDays,
    call_date_1: callDate1,
    call_date_2: callDate2,
    call_date_3: callDate3,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

// --- 린다이어트 패키지 ---

export async function createDietPackage(
  supabase: SupabaseClient,
  input: { patientName: string; detoxStartDate: string; createdBy: string | null }
): Promise<void> {
  const { data, error } = await supabase
    .from('diet_packages')
    .insert({ patient_name: input.patientName, detox_start_date: input.detoxStartDate, created_by: input.createdBy })
    .select()
    .single();
  if (error) throw error;

  const callDates = computeDietCallDates(input.detoxStartDate);
  const { error: callsError } = await supabase
    .from('diet_package_calls')
    .insert(callDates.map((callDate) => ({ package_id: data.id, call_date: callDate })));
  if (callsError) throw callsError;
}

export async function addDietPackageCall(supabase: SupabaseClient, packageId: string, callDate: string): Promise<void> {
  const { error } = await supabase.from('diet_package_calls').insert({ package_id: packageId, call_date: callDate });
  if (error) throw error;
}

export async function listDietPackages(supabase: SupabaseClient): Promise<DietPackage[]> {
  const { data, error } = await supabase
    .from('diet_packages')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    patientName: row.patient_name,
    detoxStartDate: row.detox_start_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

// --- 초진 수동 추가 ---

export async function createManualEntry(
  supabase: SupabaseClient,
  input: { patientName: string; note: string; callDate: string; createdBy: string | null }
): Promise<string> {
  const { data, error } = await supabase
    .from('happy_call_manual_entries')
    .insert({
      patient_name: input.patientName,
      note: input.note || null,
      call_date: input.callDate,
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
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
