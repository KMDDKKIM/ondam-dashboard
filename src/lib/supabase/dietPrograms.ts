import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deskCallNote,
  isDietProgramPurchase,
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
import { reminderDetail } from '@/lib/dietReminders';
import { groupTodayContacts } from '@/lib/careToday';
import { listCareDue, type CarePatient } from './herbCare';
import { createManualEntry, getManualEntryStates, removeOpenManualEntries, renameOpenManualEntries } from './happyCallQueue';
import { loadRules } from './happyCallRules';

// 린다이어트 프로그램(diet_programs), 원장 카톡 보냄 기록(diet_program_sends), 데스크 해피콜 연결(diet_program_calls).
// 승인된 직원 전원이 읽고 쓴다. 프로그램은 비급여 현황의 린다이어트 결제에서 만들고(syncDietProgramForPurchase), 데스크 해피콜은 해피콜 목록(happy_call_manual_entries)에 만든다.

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
  purchase_id?: string | null;
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
    purchaseId: r.purchase_id ?? null,
  };
}

/** 화면에서 바꿀 수 있는 값(없는 키는 그대로 둔다). 빈 문자열은 비운다는 뜻이다. */
export type ProgramPatch = Partial<Omit<DietProgram, 'id' | 'purchaseId'>>;

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
export async function createDeskCall(supabase: SupabaseClient, program: DietProgram, code: DeskCallCode, callDate: string, createdBy: string | null, detail?: string): Promise<boolean> {
  const { data: existing } = await supabase.from(CALLS).select('id').eq('program_id', program.id).eq('code', code).eq('due_date', callDate).maybeSingle();
  if (existing) return false;
  const entryId = await createManualEntry(supabase, {
    patientName: program.patientName,
    note: deskCallNote(code, detail),
    callDate,
    createdBy,
    callType: '린다이어트',
    phone: program.phone || null,
  });
  await linkCall(supabase, program.id, code, callDate, entryId);
  return true;
}

/**
 * 데스크 해피콜(디톡스 시작일·다음날·다다음날)을 프로그램 날짜에 맞춘다.
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
  const rules = await loadRules(supabase);
  const ops = planDeskSync(scheduledDeskCalls(program, rules.diet), existing, today);
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
 * 비급여 결제에 맞는 린다이어트 프로그램을 만들거나 고치거나 지운다. 린다이어트 결제이고 디톡스 시작일을 적었으면 프로그램이 있어야 하고
 * (없으면 만들고, 있으면 날짜·이름 등을 맞춘다), 아니면 프로그램과 아직 손대지 않은 해피콜을 지운다. 해피콜은 프로그램 날짜에 맞춰 다시 맞춰진다.
 * 결제는 이미 저장됐으니 호출하는 쪽에서 오류를 삼켜 결제 등록·수정이 막히지 않게 한다.
 */
export async function syncDietProgramForPurchase(
  supabase: SupabaseClient,
  purchase: {
    id: string;
    patientName: string;
    chartNo: string;
    phone: string | null;
    productName: string;
    goalCategory: string | null;
    purchaseDate: string;
    detoxStartDate: string | null;
    dietWeeks: number | null;
  },
  createdBy: string | null
): Promise<void> {
  const wants = isDietProgramPurchase(purchase.productName, purchase.goalCategory) && !!purchase.detoxStartDate;
  const { data: existingRow, error } = await supabase.from(TABLE).select('*').eq('purchase_id', purchase.id).maybeSingle();
  if (error) throw error;
  const existing = existingRow ? rowToProgram(existingRow as Row) : null;

  if (!wants) {
    if (existing) await deleteDietProgram(supabase, existing.id);
    return;
  }
  const fields: ProgramPatch = {
    patientName: purchase.patientName,
    chartNo: purchase.chartNo,
    phone: purchase.phone ?? '',
    track: 'visit',
    firstDate: purchase.purchaseDate,
    paidAt: purchase.purchaseDate,
    detoxStartDate: purchase.detoxStartDate ?? '',
    weeks: purchase.dietWeeks,
    status: 'active',
    endedAt: '',
  };
  if (existing) {
    // 환자 이름이 바뀌었으면 아직 안 한 해피콜의 이름도 맞춘다.
    if (existing.patientName !== purchase.patientName) {
      const { data: links } = await supabase.from(CALLS).select('entry_id').eq('program_id', existing.id);
      await renameOpenManualEntries(supabase, ((links ?? []) as { entry_id: string }[]).map((l) => l.entry_id), purchase.patientName).catch(() => {});
    }
    await updateDietProgram(supabase, existing.id, fields, createdBy);
    return;
  }
  const { data, error: insertError } = await supabase
    .from(TABLE)
    .insert({ ...patchToRow(fields), purchase_id: purchase.id, created_by: createdBy })
    .select('*')
    .single();
  if (insertError) throw insertError;
  await syncDeskCalls(supabase, rowToProgram(data as Row), createdBy);
}

/** 결제를 지우기 전에 그 결제로 만든 프로그램과 아직 손대지 않은 해피콜을 지운다(결제를 지우면 프로그램은 함께 사라지지만 해피콜 목록의 해피콜은 따로 지워야 한다). */
export async function deleteDietProgramForPurchase(supabase: SupabaseClient, purchaseId: string): Promise<void> {
  const { data } = await supabase.from(TABLE).select('id').eq('purchase_id', purchaseId).maybeSingle();
  if (data) await deleteDietProgram(supabase, (data as { id: string }).id);
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
  const rules = await loadRules(supabase);
  return { programs, due: ownerDueMessages(programs, today, sends, undefined, { rules: rules.diet }) };
}

/**
 * 홈·왼쪽 메뉴 알림용 건수 — 오늘 원장이 연락할 린다이어트 환자 수 + 다음 해피콜 날짜가 된 한약 환자 수.
 * 둘 다 읽지 못하면(표가 아직 없는 등) null(알림을 숨긴다). 하나만 못 읽으면 읽은 것만 센다.
 */
export async function countOwnerDue(supabase: SupabaseClient, today: string): Promise<number | null> {
  let owner: { programs: DietProgram[]; due: DueMessage[] } = { programs: [], due: [] };
  let careDue: CarePatient[] = [];
  let readSomething = false;
  try {
    owner = await loadOwnerDue(supabase, today);
    readSomething = true;
  } catch {
    // 린다이어트 표가 없으면 이 부분은 건너뛴다.
  }
  try {
    careDue = await listCareDue(supabase, today);
    readSomething = true;
  } catch {
    // 해피콜 날짜 칸이 없으면 이 부분은 건너뛴다.
  }
  // 케어 보드와 같은 방식으로 센다 — 한 환자에게 해피콜과 카톡이 겹쳐도 한 명.
  return readSomething ? groupTodayContacts(careDue, owner.due, owner.programs, today).length : null;
}

let lastReminderRun = 0;
const REMINDER_THROTTLE_MS = 3 * 60 * 1000;

/**
 * 내일 예약이 있는 진행 중 린다이어트 환자에게 "예약 전날 리마인드" 해피콜을 오늘 날짜로 올린다. 예약관리의 예약은 서버(/api/diet-reminders)가
 * 읽어 프로그램과 맞춰 주고, 같은 환자·같은 날 리마인드는 한 번만 만들어진다. 해피콜 목록을 열 때마다 부르되 3분 안에 다시 부르면 건너뛴다.
 * 실패해도 해피콜 목록 표시에는 영향이 없다.
 */
export async function syncDietReservationReminders(supabase: SupabaseClient, today = todayKst()): Promise<{ created: number }> {
  const now = Date.now();
  if (now - lastReminderRun < REMINDER_THROTTLE_MS) return { created: 0 };
  lastReminderRun = now;
  try {
    const tomorrow = addDaysKst(today, 1);
    const response = await fetch(`/api/diet-reminders?date=${tomorrow}`);
    if (!response.ok) return { created: 0 };
    const { matches } = (await response.json()) as { matches: { programId: string; timeLabel: string }[] };
    if (!matches || matches.length === 0) return { created: 0 };
    const programs = new Map((await listDietPrograms(supabase)).filter((p) => p.status === 'active').map((p) => [p.id, p]));
    let created = 0;
    for (const m of matches) {
      const program = programs.get(m.programId);
      if (program && (await createDeskCall(supabase, program, 'reservation-reminder', today, null, reminderDetail(tomorrow, m.timeLabel)))) created += 1;
    }
    return { created };
  } catch {
    return { created: 0 };
  }
}
