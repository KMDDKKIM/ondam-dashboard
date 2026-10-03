import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReceptionPayment, ReceptionRecord, ReceptionVisitKind } from '@/lib/receptionLog';
import type { ReceptionEntry } from '@/lib/happyCallAutoRegister';
import { fetchAllPages } from '@/lib/fetchAllPages';

interface Row {
  id: string;
  visit_date: string;
  seq: number;
  visit_kind: '초진' | '재초진' | '재진' | null;
  patient_name: string;
  birth_date: string | null;
  treatment: string | null;
  fee: number | null;
  payment: ReceptionPayment | null;
  reserved: boolean;
  chuna: boolean;
  excluded: boolean;
  note: string | null;
}

function rowToRecord(r: Row): ReceptionRecord {
  return {
    id: r.id,
    visitDate: r.visit_date,
    seq: r.seq,
    visitKind: r.visit_kind ?? '재진',
    patientName: r.patient_name,
    birthDate: r.birth_date,
    treatment: r.treatment,
    fee: r.fee,
    payment: r.payment,
    reserved: r.reserved,
    chuna: r.chuna,
    excluded: r.excluded,
    note: r.note,
  };
}

export async function listReceptionRecords(supabase: SupabaseClient, date: string): Promise<ReceptionRecord[]> {
  const { data, error } = await supabase
    .from('reception_records')
    .select('*')
    .eq('visit_date', date)
    .order('seq', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(rowToRecord);
}

export interface NewReceptionRecord {
  visitDate: string;
  visitKind: ReceptionVisitKind;
  patientName: string;
  birthDate: string | null;
  treatment: string | null;
  fee: number | null;
  payment: ReceptionPayment | null;
  reserved: boolean;
  chuna: boolean;
  excluded: boolean;
  note: string | null;
  createdBy: string | null;
}

/** 그날 맨 아래에 붙인다(번호 = 지금까지 가장 큰 번호 + 1). */
export async function createReceptionRecord(
  supabase: SupabaseClient,
  input: NewReceptionRecord,
  currentMaxSeq: number
): Promise<ReceptionRecord> {
  const { data, error } = await supabase
    .from('reception_records')
    .insert({
      visit_date: input.visitDate,
      seq: currentMaxSeq + 1,
      visit_kind: input.visitKind,
      patient_name: input.patientName,
      birth_date: input.birthDate,
      treatment: input.treatment,
      fee: input.fee,
      payment: input.payment,
      reserved: input.reserved,
      chuna: input.chuna,
      excluded: input.excluded,
      note: input.note,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToRecord(data as Row);
}

export type ReceptionRecordPatch = Partial<Omit<ReceptionRecord, 'id' | 'visitDate' | 'seq'>>;

// RLS가 막으면 오류 없이 0행이 바뀌므로 실제로 바뀌었는지 확인한다.
export async function updateReceptionRecord(supabase: SupabaseClient, id: string, patch: ReceptionRecordPatch): Promise<void> {
  const db: Record<string, unknown> = {};
  if ('visitKind' in patch) db.visit_kind = patch.visitKind;
  if ('patientName' in patch) db.patient_name = patch.patientName;
  if ('birthDate' in patch) db.birth_date = patch.birthDate;
  if ('treatment' in patch) db.treatment = patch.treatment;
  if ('fee' in patch) db.fee = patch.fee;
  if ('payment' in patch) db.payment = patch.payment;
  if ('reserved' in patch) db.reserved = patch.reserved;
  if ('chuna' in patch) db.chuna = patch.chuna;
  if ('excluded' in patch) db.excluded = patch.excluded;
  if ('note' in patch) db.note = patch.note;
  const { data, error } = await supabase.from('reception_records').update(db).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('저장하지 못했어요.');
}

export async function deleteReceptionRecord(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('reception_records').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('지우지 못했어요.');
}

// 접수기록부가 처음 시작된 날(가장 이른 기록의 날짜). 비어 있으면 null. 재내원 날짜 자동 채우기가
// "이 날 이후 초진인 환자"만 다루는 기준이다 — 그 전의 내원은 접수기록부에 없다.
export async function getReceptionCoverageStart(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from('reception_records').select('visit_date').order('visit_date', { ascending: true }).limit(1);
  if (error) throw error;
  return (data?.[0] as { visit_date: string } | undefined)?.visit_date ?? null;
}

interface VisitLiteRow {
  visit_date: string;
  patient_name: string;
  birth_date: string | null;
  visit_kind: '초진' | '재초진' | '재진' | null;
  excluded: boolean;
}

// from 날짜 이후의 접수 기록(날짜·이름·생년월일·초진/재진 구분·제외 여부만) — 해피콜 자동 등록과 재내원 날짜 자동 채우기용.
export async function listReceptionEntriesSince(supabase: SupabaseClient, from: string): Promise<ReceptionEntry[]> {
  const rows = await fetchAllPages<VisitLiteRow>(async (a, b) => {
    const { data, error, count } = await supabase
      .from('reception_records')
      .select('visit_date, patient_name, birth_date, visit_kind, excluded', { count: 'exact' })
      .gte('visit_date', from)
      .order('visit_date', { ascending: true })
      .order('id', { ascending: true })
      .range(a, b);
    return { data: data as VisitLiteRow[] | null, error, count };
  });
  return rows.map((r) => ({ visitDate: r.visit_date, patientName: r.patient_name, birthDate: r.birth_date, visitKind: r.visit_kind ?? '재진', excluded: r.excluded }));
}

