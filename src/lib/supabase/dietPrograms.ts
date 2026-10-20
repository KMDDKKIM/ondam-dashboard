import type { SupabaseClient } from '@supabase/supabase-js';
import { ownerDueMessages, type DietProgram, type DietStatus, type DietTrack, type DueMessage, type SendKey } from '@/lib/dietProgram';

// 린다이어트 프로그램 카드(diet_programs)와 원장 카톡 보냄 기록(diet_program_sends). 승인된 직원 전원이 읽고 쓴다.

const TABLE = 'diet_programs';
const SENDS = 'diet_program_sends';

interface Row {
  id: string;
  patient_name: string;
  chart_no: string | null;
  phone: string | null;
  track: DietTrack;
  first_date: string | null;
  weeks: number | null;
  paid_at: string | null;
  shipped_at: string | null;
  detox_start_date: string | null;
  detox_days: number | null;
  medicine_end_date: string | null;
  revisit_date: string | null;
  last_record_date: string | null;
  last_doctor_contact_date: string | null;
  status: DietStatus;
  ended_at: string | null;
  memo: string | null;
}

function rowToProgram(r: Row): DietProgram {
  return {
    id: r.id,
    patientName: r.patient_name,
    chartNo: r.chart_no ?? '',
    phone: r.phone ?? '',
    track: r.track,
    firstDate: r.first_date,
    weeks: r.weeks,
    paidAt: r.paid_at,
    shippedAt: r.shipped_at,
    detoxStartDate: r.detox_start_date,
    detoxDays: r.detox_days ?? 3,
    medicineEndDate: r.medicine_end_date,
    revisitDate: r.revisit_date,
    lastRecordDate: r.last_record_date,
    lastDoctorContactDate: r.last_doctor_contact_date,
    status: r.status,
    endedAt: r.ended_at,
    memo: r.memo ?? '',
  };
}

/** 화면에서 바꿀 수 있는 값(없는 키는 그대로 둔다). 빈 문자열은 비운다는 뜻이다. */
export type ProgramPatch = Partial<Omit<DietProgram, 'id'>>;

function patchToRow(patch: ProgramPatch): Record<string, unknown> {
  const blank = (v: string | null | undefined) => (v == null || v === '' ? null : v);
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.patientName !== undefined) row.patient_name = patch.patientName.trim();
  if (patch.chartNo !== undefined) row.chart_no = blank(patch.chartNo?.trim());
  if (patch.phone !== undefined) row.phone = blank(patch.phone?.trim());
  if (patch.track !== undefined) row.track = patch.track;
  if (patch.firstDate !== undefined) row.first_date = blank(patch.firstDate);
  if (patch.weeks !== undefined) row.weeks = patch.weeks;
  if (patch.paidAt !== undefined) row.paid_at = blank(patch.paidAt);
  if (patch.shippedAt !== undefined) row.shipped_at = blank(patch.shippedAt);
  if (patch.detoxStartDate !== undefined) row.detox_start_date = blank(patch.detoxStartDate);
  if (patch.detoxDays !== undefined) row.detox_days = patch.detoxDays;
  if (patch.medicineEndDate !== undefined) row.medicine_end_date = blank(patch.medicineEndDate);
  if (patch.revisitDate !== undefined) row.revisit_date = blank(patch.revisitDate);
  if (patch.lastRecordDate !== undefined) row.last_record_date = blank(patch.lastRecordDate);
  if (patch.lastDoctorContactDate !== undefined) row.last_doctor_contact_date = blank(patch.lastDoctorContactDate);
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.endedAt !== undefined) row.ended_at = blank(patch.endedAt);
  if (patch.memo !== undefined) row.memo = blank(patch.memo);
  return row;
}

export async function listDietPrograms(supabase: SupabaseClient): Promise<DietProgram[]> {
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data as Row[]).map(rowToProgram);
}

export async function createDietProgram(
  supabase: SupabaseClient,
  input: { patientName: string; chartNo?: string; phone?: string; track: DietTrack; firstDate?: string; weeks?: number | null },
  createdBy: string | null
): Promise<void> {
  const row = patchToRow({ patientName: input.patientName, chartNo: input.chartNo ?? '', phone: input.phone ?? '', track: input.track, firstDate: input.firstDate ?? '', weeks: input.weeks ?? null });
  const { error } = await supabase.from(TABLE).insert({ ...row, created_by: createdBy });
  if (error) throw error;
}

export async function updateDietProgram(supabase: SupabaseClient, id: string, patch: ProgramPatch): Promise<void> {
  const { data, error } = await supabase.from(TABLE).update(patchToRow(patch)).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('저장하지 못했어요.');
}

export async function deleteDietProgram(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('지우지 못했어요.');
}

export async function listProgramSends(supabase: SupabaseClient, sinceDate: string): Promise<SendKey[]> {
  const { data, error } = await supabase.from(SENDS).select('program_id, code, due_date').gte('due_date', sinceDate).limit(5000);
  if (error) throw error;
  return (data as { program_id: string; code: string; due_date: string }[]).map((r) => ({ programId: r.program_id, code: r.code, dueDate: r.due_date }));
}

/**
 * 원장 카톡을 "보냄"/"건너뜀"으로 기록한다. 보냄이면 그 환자의 마지막 원장 연락일도 오늘로 갱신한다(기록 안부 간격 계산용).
 * 같은 (환자, 메시지, 예정일)을 두 번 누르면 한 번만 남는다.
 */
export async function recordOwnerSend(
  supabase: SupabaseClient,
  item: { programId: string; code: string; dueDate: string },
  action: 'sent' | 'skipped',
  staffId: string | null,
  today: string
): Promise<void> {
  const { error } = await supabase.from(SENDS).upsert(
    { program_id: item.programId, code: item.code, due_date: item.dueDate, action, by_staff: staffId },
    { onConflict: 'program_id,code,due_date' }
  );
  if (error) throw error;
  if (action === 'sent') await updateDietProgram(supabase, item.programId, { lastDoctorContactDate: today });
}

/** 오늘 원장이 카톡을 보낼 차례인 것들(진행 중인 환자 기준). 읽기에 실패하면 던진다. */
export async function loadOwnerDue(supabase: SupabaseClient, today: string): Promise<{ programs: DietProgram[]; due: DueMessage[] }> {
  const programs = (await listDietPrograms(supabase)).filter((p) => p.status === 'active');
  if (programs.length === 0) return { programs, due: [] };
  const sends = await listProgramSends(supabase, today.slice(0, 4) + '-01-01');
  return { programs, due: ownerDueMessages(programs, today, sends) };
}

/** 홈·왼쪽 메뉴 알림용 건수. 표가 아직 없거나 읽기에 실패하면 null(알림을 숨긴다). */
export async function countOwnerDue(supabase: SupabaseClient, today: string): Promise<number | null> {
  try {
    const { due } = await loadOwnerDue(supabase, today);
    return new Set(due.map((d) => d.programId)).size;
  } catch {
    return null;
  }
}
