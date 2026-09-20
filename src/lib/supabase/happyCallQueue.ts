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

export async function updateManualEntryCallDate(
  supabase: SupabaseClient,
  id: string,
  callDate: string
): Promise<void> {
  const { error } = await supabase.from('happy_call_manual_entries').update({ call_date: callDate }).eq('id', id);
  if (error) throw error;
}
