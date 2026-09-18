import type { SupabaseClient } from '@supabase/supabase-js';
import type { HappyCallPatient } from '@/lib/types';

interface HappyCallPatientRow {
  id: string;
  patient_name: string;
  doctor_staff_id: string | null;
  patient_type: '건보' | '자보' | '비급여';
  acupuncture_package_success: '성공' | '실패' | '비포함' | null;
  first_visit_date: string;
  revisit_1: string | null;
  revisit_2: string | null;
  revisit_3: string | null;
  jabo_herb_1: string | null;
  jabo_herb_2: string | null;
  jabo_herb_3: string | null;
  next_visit_note: string | null;
  call_log: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

function rowToPatient(row: HappyCallPatientRow): HappyCallPatient {
  return {
    id: row.id,
    patientName: row.patient_name,
    doctorStaffId: row.doctor_staff_id,
    patientType: row.patient_type,
    acupunctureSuccess: row.acupuncture_package_success,
    firstVisitDate: row.first_visit_date,
    revisit1: row.revisit_1,
    revisit2: row.revisit_2,
    revisit3: row.revisit_3,
    jaboHerb1: row.jabo_herb_1,
    jaboHerb2: row.jabo_herb_2,
    jaboHerb3: row.jabo_herb_3,
    nextVisitNote: row.next_visit_note,
    callLog: row.call_log,
    memo: row.memo,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listHappyCallPatients(supabase: SupabaseClient): Promise<HappyCallPatient[]> {
  const { data, error } = await supabase
    .from('happy_call_patients')
    .select('*')
    .order('first_visit_date', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data as HappyCallPatientRow[]).map(rowToPatient);
}

export interface NewHappyCallPatient {
  patientName: string;
  doctorStaffId: string | null;
  patientType: '건보' | '자보' | '비급여';
  firstVisitDate: string;
  createdBy: string | null;
}

export async function createHappyCallPatient(
  supabase: SupabaseClient,
  input: NewHappyCallPatient
): Promise<HappyCallPatient> {
  const { data, error } = await supabase
    .from('happy_call_patients')
    .insert({
      patient_name: input.patientName,
      doctor_staff_id: input.doctorStaffId,
      patient_type: input.patientType,
      first_visit_date: input.firstVisitDate,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToPatient(data as HappyCallPatientRow);
}

export type HappyCallPatientPatch = Partial<{
  revisit1: string | null;
  revisit2: string | null;
  revisit3: string | null;
  jaboHerb1: string | null;
  jaboHerb2: string | null;
  jaboHerb3: string | null;
  acupunctureSuccess: '성공' | '실패' | '비포함' | null;
  nextVisitNote: string | null;
  callLog: string | null;
  memo: string | null;
}>;

export async function updateHappyCallPatient(
  supabase: SupabaseClient,
  id: string,
  patch: HappyCallPatientPatch
): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if ('revisit1' in patch) dbPatch.revisit_1 = patch.revisit1;
  if ('revisit2' in patch) dbPatch.revisit_2 = patch.revisit2;
  if ('revisit3' in patch) dbPatch.revisit_3 = patch.revisit3;
  if ('jaboHerb1' in patch) dbPatch.jabo_herb_1 = patch.jaboHerb1;
  if ('jaboHerb2' in patch) dbPatch.jabo_herb_2 = patch.jaboHerb2;
  if ('jaboHerb3' in patch) dbPatch.jabo_herb_3 = patch.jaboHerb3;
  if ('acupunctureSuccess' in patch) dbPatch.acupuncture_package_success = patch.acupunctureSuccess;
  if ('nextVisitNote' in patch) dbPatch.next_visit_note = patch.nextVisitNote;
  if ('callLog' in patch) dbPatch.call_log = patch.callLog;
  if ('memo' in patch) dbPatch.memo = patch.memo;

  const { error } = await supabase.from('happy_call_patients').update(dbPatch).eq('id', id);
  if (error) throw error;
}
