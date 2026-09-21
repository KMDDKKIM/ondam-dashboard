import type { SupabaseClient } from '@supabase/supabase-js';
import type { Staff } from '@/lib/types';

export interface Doctor {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

interface Row {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
}

export async function listDoctors(supabase: SupabaseClient): Promise<Doctor[]> {
  const { data, error } = await supabase
    .from('doctors')
    .select('id, name, active, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as Row[]).map((r) => ({ id: r.id, name: r.name, active: r.active, sortOrder: r.sort_order }));
}

// 진료의 선택 칸·통계 필터 등은 원래 직원 목록(Staff[])을 받게 만들어져 있어서, 활성 진료의를 같은 모양으로 넘긴다.
export function doctorsAsStaffList(doctors: Doctor[]): Staff[] {
  return doctors.filter((d) => d.active).map((d) => ({ id: d.id, name: d.name, role: 'staff' as const }));
}

export async function addDoctor(supabase: SupabaseClient, name: string, existing: Doctor[]): Promise<void> {
  const nextOrder = existing.reduce((max, d) => Math.max(max, d.sortOrder), 0) + 1;
  const { error } = await supabase.from('doctors').insert({ name, sort_order: nextOrder });
  if (error) throw error;
}

// RLS가 막으면(대표원장이 아니면) 에러 없이 0행이 바뀌므로 실제로 바뀌었는지 확인한다.
export async function renameDoctor(supabase: SupabaseClient, id: string, name: string): Promise<void> {
  const { data, error } = await supabase.from('doctors').update({ name }).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('수정하지 못했어요.');
}

// 지우지 않고 숨긴다 — 그 진료의로 등록된 예전 기록의 이름이 계속 보이도록.
export async function setDoctorActive(supabase: SupabaseClient, id: string, active: boolean): Promise<void> {
  const { data, error } = await supabase.from('doctors').update({ active }).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('바꾸지 못했어요.');
}
