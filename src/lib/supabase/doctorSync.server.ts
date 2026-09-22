import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isDoctorGrade, isStaffGrade } from '@/lib/staffGrade';
import { planDoctorSync, type ExistingDoctorRow, type QualifyingStaff } from '@/lib/doctorSync';

interface StaffRow {
  id: string;
  name: string;
  grade: string | null;
}

interface DoctorRow {
  id: string;
  name: string;
  staff_id: string | null;
  active: boolean;
  sort_order: number;
}

/**
 * 진료의 목록(doctors)을 지금의 직원 계정(대표원장·부원장, 승인됨)에 맞춘다.
 * 직원을 승인하거나, 등급을 바꾸거나, 퇴사시킬 때마다 이 함수를 부른다 — 그래야 초진환자 해피콜·한약 대기방
 * 같은 화면의 "진료의" 선택 칸이 따로 손대지 않아도 최신 상태로 유지된다. admin(service_role) 클라이언트로만
 * 불러야 한다(doctors 쓰기는 대표원장 role 에게만 RLS가 열려 있어서).
 */
export async function syncDoctorsFromStaff(admin: SupabaseClient): Promise<void> {
  const [staffRes, doctorsRes] = await Promise.all([
    admin.from('staff').select('id, name, grade').eq('status', 'approved'),
    admin.from('doctors').select('id, name, staff_id, active, sort_order'),
  ]);
  if (staffRes.error) throw staffRes.error;
  if (doctorsRes.error) throw doctorsRes.error;

  const qualifying: QualifyingStaff[] = ((staffRes.data ?? []) as StaffRow[])
    .filter((s) => isStaffGrade(s.grade) && isDoctorGrade(s.grade))
    .map((s) => ({ id: s.id, name: s.name, grade: s.grade as QualifyingStaff['grade'] }));
  const existing: ExistingDoctorRow[] = ((doctorsRes.data ?? []) as DoctorRow[]).map((d) => ({
    id: d.id,
    name: d.name,
    staffId: d.staff_id,
    active: d.active,
    sortOrder: d.sort_order,
  }));

  const plan = planDoctorSync(qualifying, existing);

  if (plan.insert.length > 0) {
    const { error } = await admin
      .from('doctors')
      .insert(plan.insert.map((d) => ({ name: d.name, staff_id: d.staffId, sort_order: d.sortOrder })));
    if (error) throw error;
  }
  for (const patch of plan.update) {
    const db: Record<string, unknown> = {};
    if (patch.name !== undefined) db.name = patch.name;
    if (patch.staffId !== undefined) db.staff_id = patch.staffId;
    if (patch.active !== undefined) db.active = patch.active;
    if (patch.sortOrder !== undefined) db.sort_order = patch.sortOrder;
    const { error } = await admin.from('doctors').update(db).eq('id', patch.id);
    if (error) throw error;
  }
}
