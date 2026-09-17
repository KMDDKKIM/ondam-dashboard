import type { SupabaseClient } from '@supabase/supabase-js';
import { computeHerbCallDates, computeDietCallDates } from '@/lib/happyCallStats';
import type { HerbMedicinePrescription, DietPackage, DietPackageCall, HappyCallManualEntry } from '@/lib/types';

// --- 한약 처방 ---

interface HerbPrescriptionRow {
  id: string;
  patient_name: string;
  pickup_date: string;
  duration_days: number;
  call_date_1: string;
  call_date_2: string;
  call_date_3: string;
  call_1_done: boolean;
  call_2_done: boolean;
  call_3_done: boolean;
  call_1_note: string | null;
  call_2_note: string | null;
  call_3_note: string | null;
  created_by: string | null;
  created_at: string;
}

function rowToHerbPrescription(row: HerbPrescriptionRow): HerbMedicinePrescription {
  return {
    id: row.id,
    patientName: row.patient_name,
    pickupDate: row.pickup_date,
    durationDays: row.duration_days,
    callDate1: row.call_date_1,
    callDate2: row.call_date_2,
    callDate3: row.call_date_3,
    call1Done: row.call_1_done,
    call2Done: row.call_2_done,
    call3Done: row.call_3_done,
    call1Note: row.call_1_note,
    call2Note: row.call_2_note,
    call3Note: row.call_3_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

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

export async function listPendingHerbCalls(supabase: SupabaseClient, today: string): Promise<HerbMedicinePrescription[]> {
  const { data, error } = await supabase
    .from('herb_medicine_prescriptions')
    .select('*')
    .or(
      `and(call_date_1.lte.${today},call_1_done.eq.false),and(call_date_2.lte.${today},call_2_done.eq.false),and(call_date_3.lte.${today},call_3_done.eq.false)`
    );
  if (error) throw error;
  return (data as HerbPrescriptionRow[]).map(rowToHerbPrescription);
}

export async function markHerbCallDone(supabase: SupabaseClient, id: string, callNumber: 1 | 2 | 3, note: string): Promise<void> {
  const patch: Record<string, unknown> = {
    [`call_${callNumber}_done`]: true,
    [`call_${callNumber}_note`]: note || null,
  };
  const { error } = await supabase.from('herb_medicine_prescriptions').update(patch).eq('id', id);
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

export interface PendingDietCall extends DietPackageCall {
  patientName: string;
}

interface DietPackageCallRow {
  id: string;
  package_id: string;
  call_date: string;
  done: boolean;
  note: string | null;
  diet_packages: { patient_name: string } | null;
}

export async function listPendingDietCalls(supabase: SupabaseClient, today: string): Promise<PendingDietCall[]> {
  const { data, error } = await supabase
    .from('diet_package_calls')
    .select('id, package_id, call_date, done, note, diet_packages(patient_name)')
    .lte('call_date', today)
    .eq('done', false);
  if (error) throw error;
  return (data as unknown as DietPackageCallRow[]).map((row) => ({
    id: row.id,
    packageId: row.package_id,
    callDate: row.call_date,
    done: row.done,
    note: row.note,
    patientName: row.diet_packages?.patient_name ?? '-',
  }));
}

export async function markDietCallDone(supabase: SupabaseClient, id: string, note: string): Promise<void> {
  const { error } = await supabase.from('diet_package_calls').update({ done: true, note: note || null }).eq('id', id);
  if (error) throw error;
}

// --- 초진 수동 추가 ---

export async function createManualEntry(
  supabase: SupabaseClient,
  input: { patientName: string; note: string; callDate: string; createdBy: string | null }
): Promise<void> {
  const { error } = await supabase.from('happy_call_manual_entries').insert({
    patient_name: input.patientName,
    note: input.note || null,
    call_date: input.callDate,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

export async function listPendingManualEntries(supabase: SupabaseClient, today: string): Promise<HappyCallManualEntry[]> {
  const { data, error } = await supabase.from('happy_call_manual_entries').select('*').lte('call_date', today).eq('done', false);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    patientName: row.patient_name,
    note: row.note,
    callDate: row.call_date,
    done: row.done,
    doneNote: row.done_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export async function markManualEntryDone(supabase: SupabaseClient, id: string, doneNote: string): Promise<void> {
  const { error } = await supabase.from('happy_call_manual_entries').update({ done: true, done_note: doneNote || null }).eq('id', id);
  if (error) throw error;
}
