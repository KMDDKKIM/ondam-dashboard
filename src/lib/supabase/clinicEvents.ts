import type { SupabaseClient } from '@supabase/supabase-js';

// 한의원 이벤트(홈 달력 일정) — 읽기는 승인된 직원 전체, 추가·삭제는 원장만(RLS가 강제).

export interface ClinicEvent {
  id: string;
  eventDate: string;
  title: string;
  createdBy: string | null;
  createdAt: string;
}

interface ClinicEventRow {
  id: string;
  event_date: string;
  title: string;
  created_by: string | null;
  created_at: string;
}

function rowToEvent(r: ClinicEventRow): ClinicEvent {
  return { id: r.id, eventDate: r.event_date, title: r.title, createdBy: r.created_by, createdAt: r.created_at };
}

export async function listClinicEvents(
  supabase: SupabaseClient,
  range: { from: string; to: string }
): Promise<ClinicEvent[]> {
  const { data, error } = await supabase
    .from('clinic_events')
    .select('id, event_date, title, created_by, created_at')
    .gte('event_date', range.from)
    .lte('event_date', range.to)
    .order('event_date', { ascending: true });
  if (error) throw error;
  return (data as ClinicEventRow[]).map(rowToEvent);
}

// 원장 전용(RLS가 강제).
export async function createClinicEvent(
  supabase: SupabaseClient,
  input: { eventDate: string; title: string; createdBy: string | null }
): Promise<void> {
  const { error } = await supabase
    .from('clinic_events')
    .insert({ event_date: input.eventDate, title: input.title, created_by: input.createdBy });
  if (error) throw error;
}

// 원장 전용(RLS가 강제).
export async function deleteClinicEvent(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('clinic_events').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('삭제할 수 없습니다.');
}
