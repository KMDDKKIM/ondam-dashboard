// 진료의 목록(doctors)을 직원 계정에서 자동으로 맞추는 순수 로직. DB 접근은 src/lib/supabase/doctorSync.server.ts.
//
// 원장 결정: 진료의는 더 이상 따로 추가·이름변경하지 않는다 — 대표원장·부원장 등급의 승인된 직원 계정이
// 곧 진료의 목록이다. 직원을 승인하거나 등급을 바꾸거나 퇴사시킬 때마다 이 목록을 다시 맞춘다.
// doctors.id 는 그대로 두어야 한다(환자 기록이 그 id를 가리키고 있으므로) — 그래서 지우지 않고
// 링크(staff_id 연결)하거나 숨긴다(active=false).
import { DOCTOR_GRADES, type StaffGrade } from './staffGrade';

export interface QualifyingStaff {
  id: string;
  name: string;
  grade: StaffGrade;
}

export interface ExistingDoctorRow {
  id: string;
  name: string;
  staffId: string | null;
  active: boolean;
  sortOrder: number;
}

export interface DoctorSyncPlan {
  insert: { name: string; staffId: string; sortOrder: number }[];
  update: { id: string; name?: string; staffId?: string; active?: boolean; sortOrder?: number }[];
}

function sortOrderFor(grade: StaffGrade): number {
  const rank = DOCTOR_GRADES.indexOf(grade);
  return rank === -1 ? DOCTOR_GRADES.length : rank;
}

/**
 * 지금 진료의 자격(대표원장·부원장, 승인됨)인 직원 목록과 지금 doctors 표를 비교해 맞출 작업을 정한다.
 *  - staff_id 로 이미 연결된 진료의는 이름·정렬순서만 최신으로(달라졌으면).
 *  - 아직 연결 안 된 예전 행(staff_id 없음)에 이름이 같은 사람이 있으면 그 행에 연결한다
 *    (직원 계정이 생기기 전부터 있던 진료의를 그대로 이어 쓰기 위해).
 *  - 그 무엇에도 안 걸리면 새로 만든다.
 *  - 더 이상 자격이 없어진(퇴사·강등) 사람의 진료의 행은 지우지 않고 숨긴다(예전 기록의 이름을 지키려고).
 */
export function planDoctorSync(qualifying: QualifyingStaff[], existing: ExistingDoctorRow[]): DoctorSyncPlan {
  const insert: DoctorSyncPlan['insert'] = [];
  const update: DoctorSyncPlan['update'] = [];
  const linked = new Set<string>();

  for (const staff of qualifying) {
    const sortOrder = sortOrderFor(staff.grade);
    const byStaffId = existing.find((d) => d.staffId === staff.id);
    if (byStaffId) {
      linked.add(byStaffId.id);
      const patch: DoctorSyncPlan['update'][number] = { id: byStaffId.id };
      if (byStaffId.name !== staff.name) patch.name = staff.name;
      if (!byStaffId.active) patch.active = true;
      if (byStaffId.sortOrder !== sortOrder) patch.sortOrder = sortOrder;
      if (Object.keys(patch).length > 1) update.push(patch);
      continue;
    }
    const byName = existing.find((d) => d.staffId === null && d.name === staff.name && !linked.has(d.id));
    if (byName) {
      linked.add(byName.id);
      update.push({ id: byName.id, staffId: staff.id, active: true, sortOrder });
      continue;
    }
    insert.push({ name: staff.name, staffId: staff.id, sortOrder });
  }

  const qualifyingIds = new Set(qualifying.map((s) => s.id));
  for (const d of existing) {
    if (d.active && d.staffId && !qualifyingIds.has(d.staffId)) {
      update.push({ id: d.id, active: false });
    }
  }

  return { insert, update };
}
