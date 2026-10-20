import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deskCallNote,
  needsConsultDoneCall,
  ownerDueMessages,
  planDeskSync,
  scheduledDeskCalls,
  SCHEDULED_DESK_CODES,
  type DeskCallCode,
  type DietProgram,
  type DietStatus,
  type DietTrack,
  type DueMessage,
  type ExistingDeskCall,
  type SendKey,
} from '@/lib/dietProgram';
import { addDaysKst, todayKst } from '@/lib/kst';
import { createManualEntry, getManualEntryStates, removeOpenManualEntries } from './happyCallQueue';

// 린다이어트 프로그램(diet_programs), 원장 카톡 보냄 기록(diet_program_sends), 데스크 해피콜 연결(diet_program_calls).
// 승인된 직원 전원이 읽고 쓴다. 데스크 해피콜은 해피콜 목록(happy_call_manual_entries)에 만든다.

const TABLE = 'diet_programs';
const SENDS = 'diet_program_sends';
const CALLS = 'diet_program_calls';

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

async function getProgram(supabase: SupabaseClient, id: string): Promise<DietProgram | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? rowToProgram(data as Row) : null;
}

// ---- 데스크 해피콜 ----

async function linkCall(supabase: SupabaseClient, programId: string, code: DeskCallCode, dueDate: string, entryId: string): Promise<void> {
  const { error } = await supabase.from(CALLS).upsert({ program_id: programId, code, due_date: dueDate, entry_id: entryId }, { onConflict: 'program_id,code,due_date' });
  if (error) throw error;
}

/** 이 프로그램의 데스크 해피콜 하나를 해피콜 목록에 만들고 연결한다(같은 단계·날짜가 이미 있으면 만들지 않는다). */
export async function createDeskCall(supabase: SupabaseClient, program: DietProgram, code: DeskCallCode, callDate: string, createdBy: string | null): Promise<boolean> {
  const { data: existing } = await supabase.from(CALLS).select('id').eq('program_id', program.id).eq('code', code).eq('due_date', callDate).maybeSingle();
  if (existing) return false;
  const entryId = await createManualEntry(supabase, {
    patientName: program.patientName,
    note: deskCallNote(code, program.track),
    callDate,
    createdBy,
    callType: '린다이어트',
    phone: program.phone || null,
  });
  await linkCall(supabase, program.id, code, callDate, entryId);
  return true;
}

/**
 * 날짜로 정해지는 데스크 해피콜(디톡스 전날·다이어트환 시작·월초 안부·약 소진 10일 전)을 프로그램 날짜에 맞춘다.
 * 이미 전화했거나 끝난 해피콜은 건드리지 않는다. 날짜가 바뀌어 필요 없어진 것은 아직 손대지 않았을 때만 지운다.
 */
export async function syncDeskCalls(supabase: SupabaseClient, program: DietProgram, createdBy: string | null, today = todayKst()): Promise<void> {
  const { data: links, error } = await supabase.from(CALLS).select('code, due_date, entry_id').eq('program_id', program.id).in('code', [...SCHEDULED_DESK_CODES]);
  if (error) throw error;
  const rows = (links ?? []) as { code: string; due_date: string; entry_id: string }[];
  const states = await getManualEntryStates(supabase, rows.map((r) => r.entry_id));
  const existing: ExistingDeskCall[] = rows.flatMap((r) => {
    const s = states.find((x) => x.id === r.entry_id);
    // 해피콜 목록에서 이미 지워진 해피콜은 연결도 없어진 것으로 본다(entry 삭제 시 연결은 cascade로 사라진다).
    return s ? [{ code: r.code, callDate: r.due_date, entryId: r.entry_id, touched: s.closed || s.attempts > 0 }] : [];
  });
  const ops = planDeskSync(scheduledDeskCalls(program), existing, today);
  for (const op of ops) {
    if (op.type === 'create') await createDeskCall(supabase, program, op.code, op.callDate, createdBy);
  }
  const removeIds = ops.flatMap((o) => (o.type === 'remove' ? [o.entryId] : []));
  await removeOpenManualEntries(supabase, removeIds, { onlyUntouched: true });
}

/** 프로그램을 지우기 전에, 만들어 둔 데스크 해피콜 중 아직 손대지 않은 것을 지운다(끝났거나 전화한 해피콜은 기록이라 남긴다). */
async function removeUntouchedDeskCalls(supabase: SupabaseClient, programId: string): Promise<void> {
  const { data } = await supabase.from(CALLS).select('entry_id').eq('program_id', programId);
  const ids = ((data ?? []) as { entry_id: string }[]).map((r) => r.entry_id);
  await removeOpenManualEntries(supabase, ids, { onlyUntouched: true });
}

// ---- 프로그램 ----

/**
 * 환자를 등록한다. 진료·상담을 마친 뒤 등록하는 것이라 "진료 후 안내" 해피콜을 오늘 날짜로 함께 만들고(디톡스를 이미 시작한 환자는 제외),
 * 날짜로 정해지는 해피콜(디톡스 전날 등)도 바로 맞춘다.
 */
export async function createDietProgram(
  supabase: SupabaseClient,
  input: { patientName: string; chartNo?: string; phone?: string; track: DietTrack; firstDate?: string; detoxStartDate?: string; weeks?: number | null },
  createdBy: string | null
): Promise<void> {
  const row = patchToRow({
    patientName: input.patientName,
    chartNo: input.chartNo ?? '',
    phone: input.phone ?? '',
    track: input.track,
    firstDate: input.firstDate ?? '',
    detoxStartDate: input.detoxStartDate ?? '',
    weeks: input.weeks ?? null,
  });
  const { data, error } = await supabase.from(TABLE).insert({ ...row, created_by: createdBy }).select('*').single();
  if (error) throw error;
  const program = rowToProgram(data as Row);
  // 해피콜 목록 쪽 오류가 환자 등록 자체를 막지 않게 한다(카드는 이미 만들어졌다).
  try {
    if (needsConsultDoneCall(program.detoxStartDate, todayKst())) await createDeskCall(supabase, program, 'consult-done', todayKst(), createdBy);
    await syncDeskCalls(supabase, program, createdBy);
  } catch {
    // 해피콜은 환자 수정 때 다시 맞춰진다.
  }
}

export async function updateDietProgram(supabase: SupabaseClient, id: string, patch: ProgramPatch, createdBy: string | null = null): Promise<void> {
  const { data, error } = await supabase.from(TABLE).update(patchToRow(patch)).eq('id', id).select('*');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('저장하지 못했어요.');
  // 날짜·방식·상태가 바뀌었으면 데스크 해피콜을 다시 맞춘다.
  const affectsCalls = ['detoxStartDate', 'detoxDays', 'weeks', 'medicineEndDate', 'track', 'status'].some((k) => k in patch);
  if (affectsCalls) {
    const program = rowToProgram(data[0] as Row);
    try {
      if (program.status === 'active') await syncDeskCalls(supabase, program, createdBy);
    } catch {
      // 해피콜 맞추기에 실패해도 저장은 된 것이다.
    }
  }
}

export async function deleteDietProgram(supabase: SupabaseClient, id: string): Promise<void> {
  await removeUntouchedDeskCalls(supabase, id);
  const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('지우지 못했어요.');
}

/**
 * 데스크가 누르는 단계 단추. 결제 확인 → 결제 후 안내, 발송 완료 → 송장 안내(비대면은 다음 날 수령 확인도), 종료 → 종료 안내를
 * 오늘 날짜로 해피콜 목록에 만들고 그 날짜도 프로그램에 기록한다.
 */
export async function markDietStep(supabase: SupabaseClient, id: string, step: 'paid' | 'shipped' | 'ended', createdBy: string | null, today = todayKst()): Promise<void> {
  const program = await getProgram(supabase, id);
  if (!program) throw new Error('환자를 찾지 못했어요.');
  if (step === 'paid') {
    await updateDietProgram(supabase, id, { paidAt: today }, createdBy);
    await createDeskCall(supabase, program, 'paid', today, createdBy);
  } else if (step === 'shipped') {
    await updateDietProgram(supabase, id, { shippedAt: today }, createdBy);
    await createDeskCall(supabase, program, 'shipped', today, createdBy);
    if (program.track === 'remote') await createDeskCall(supabase, program, 'received', addDaysKst(today, 1), createdBy);
  } else {
    await updateDietProgram(supabase, id, { status: 'ended', endedAt: today }, createdBy);
    await createDeskCall(supabase, program, 'finish', today, createdBy);
    // 종료하면 아직 하지 않은 앞으로의 예정 해피콜은 필요 없다.
    const { data } = await supabase.from(CALLS).select('entry_id, code').eq('program_id', id).in('code', [...SCHEDULED_DESK_CODES]);
    const ids = ((data ?? []) as { entry_id: string }[]).map((r) => r.entry_id);
    await removeOpenManualEntries(supabase, ids, { onlyUntouched: true });
  }
}

// ---- 원장 카톡 ----

export async function listProgramSends(supabase: SupabaseClient, sinceDate: string): Promise<SendKey[]> {
  const { data, error } = await supabase.from(SENDS).select('program_id, code, due_date').gte('due_date', sinceDate).limit(5000);
  if (error) throw error;
  return (data as { program_id: string; code: string; due_date: string }[]).map((r) => ({ programId: r.program_id, code: r.code, dueDate: r.due_date }));
}

/**
 * 원장 카톡을 "보냄"/"건너뜀"으로 기록한다. 보냄이면 그 환자의 마지막 원장 연락일도 오늘로 갱신한다.
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
