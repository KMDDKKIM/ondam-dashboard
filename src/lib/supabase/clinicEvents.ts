import type { SupabaseClient } from '@supabase/supabase-js';

// 한의원 이벤트(홈 달력 일정) — 읽기는 승인된 직원 전체, 추가·삭제는 원장만(RLS가 강제).
// 기간 이벤트라 startDate~endDate(포함)를 가진다. 하루짜리는 둘이 같다.

export interface ClinicEvent {
  id: string;
  startDate: string;
  endDate: string;
  title: string;
  createdBy: string | null;
  createdAt: string;
}

interface ClinicEventRow {
  id: string;
  event_date: string;
  end_date: string;
  title: string;
  created_by: string | null;
  created_at: string;
}

function rowToEvent(r: ClinicEventRow): ClinicEvent {
  return { id: r.id, startDate: r.event_date, endDate: r.end_date, title: r.title, createdBy: r.created_by, createdAt: r.created_at };
}

// [from, to]와 기간이 겹치는 이벤트(달력에 보이는 구간에 걸치는 것 전부).
export async function listClinicEvents(
  supabase: SupabaseClient,
  range: { from: string; to: string }
): Promise<ClinicEvent[]> {
  const { data, error } = await supabase
    .from('clinic_events')
    .select('id, event_date, end_date, title, created_by, created_at')
    .lte('event_date', range.to)
    .gte('end_date', range.from)
    .order('event_date', { ascending: true });
  if (error) throw error;
  return (data as ClinicEventRow[]).map(rowToEvent);
}

// 원장 전용(RLS가 강제).
export async function createClinicEvent(
  supabase: SupabaseClient,
  input: { startDate: string; endDate: string; title: string; createdBy: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('clinic_events')
    .insert({ event_date: input.startDate, end_date: input.endDate, title: input.title, created_by: input.createdBy });
  if (error) throw error;
}

// 원장 전용(RLS가 강제).
export async function deleteClinicEvent(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('clinic_events').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제할 수 없습니다.');
}
