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
  call_due_date?: string | null;
  call_original_due?: string | null;
  call_attempts?: number | null;
  call_result?: 'answered' | 'no_answer' | 'refused' | 'unreachable' | null;
  call_completed_by?: string | null;
  call_completed_at?: string | null;
  call_memo?: string | null;
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
    callDueDate: row.call_due_date ?? null,
    callOriginalDue: row.call_original_due ?? null,
    callAttempts: row.call_attempts ?? 0,
    callResult: row.call_result ?? null,
    callCompletedBy: row.call_completed_by ?? null,
    callCompletedAt: row.call_completed_at ?? null,
    callMemo: row.call_memo ?? null,
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

// 해피콜 목록용: 등록일과 상관없이 "아직 열려 있는" 초진 콜(결과도 통화내역도 없거나 부재중 대기 중)과
// 오늘 결과를 기록한 콜만 읽는다. 행 수로 자르지 않으므로 오래된 연체 콜이 조용히 빠지지 않는다
// (PostgREST 한 번에 1000행 제한은 페이지를 넘기며 끝까지 읽는다).
export async function listFirstVisitCallCandidates(
  supabase: SupabaseClient,
  processedSinceIso: string
): Promise<HappyCallPatient[]> {
  const PAGE = 1000;
  const rows: HappyCallPatientRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('happy_call_patients')
      .select('*')
      .or(
        `and(call_result.is.null,call_log.is.null),call_result.eq.no_answer,call_completed_at.gte.${processedSinceIso}`
      )
      .order('first_visit_date', { ascending: false })
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as HappyCallPatientRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows.map(rowToPatient);
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
  patientName: string;
  doctorStaffId: string | null;
  patientType: '건보' | '자보' | '비급여';
  firstVisitDate: string;
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
  if ('patientName' in patch) dbPatch.patient_name = patch.patientName;
  if ('doctorStaffId' in patch) dbPatch.doctor_staff_id = patch.doctorStaffId;
  if ('patientType' in patch) dbPatch.patient_type = patch.patientType;
  if ('firstVisitDate' in patch) dbPatch.first_visit_date = patch.firstVisitDate;
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
