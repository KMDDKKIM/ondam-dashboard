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

// 진료의 목록은 더 이상 여기서 따로 추가·이름변경하지 않는다 — 대표원장·부원장 등급의 승인된 직원 계정이
// 곧 진료의 목록이고, 직원을 승인/등급변경/퇴사시킬 때 서버가 자동으로 맞춘다(src/lib/supabase/doctorSync.server.ts).
// 여기서는 그렇게 맞춰진 목록을 읽기만 한다.
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
