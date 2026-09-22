import { describe, expect, it } from 'vitest';
import { planDoctorSync, type ExistingDoctorRow, type QualifyingStaff } from './doctorSync';

function staff(o: Partial<QualifyingStaff>): QualifyingStaff {
  return { id: 'id1', name: '가상원장', grade: '부원장', ...o };
}
function row(o: Partial<ExistingDoctorRow>): ExistingDoctorRow {
  return { id: 'row1', name: '가상원장', staffId: null, active: true, sortOrder: 0, ...o };
}

describe('planDoctorSync', () => {
  it('이미 staff_id 로 연결됐고 그대로면 아무 것도 하지 않는다', () => {
    const plan = planDoctorSync([staff({ id: 's1', name: '김동규', grade: '대표원장' })], [row({ id: 'd1', staffId: 's1', name: '김동규', sortOrder: 0 })]);
    expect(plan).toEqual({ insert: [], update: [] });
  });

  it('연결된 진료의의 이름이 바뀌면 doctors 이름도 맞춘다', () => {
    const plan = planDoctorSync([staff({ id: 's1', name: '김동규원장', grade: '대표원장' })], [row({ id: 'd1', staffId: 's1', name: '김동규', sortOrder: 0 })]);
    expect(plan.update).toEqual([{ id: 'd1', name: '김동규원장' }]);
  });

  it('staff_id 없이 이름만 같은 예전 진료의 행이 있으면 그 행에 연결한다(새로 만들지 않는다)', () => {
    const plan = planDoctorSync([staff({ id: 's-park', name: '박소은', grade: '부원장' })], [row({ id: 'd-park', staffId: null, name: '박소은', active: true, sortOrder: 1 })]);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([{ id: 'd-park', staffId: 's-park', active: true, sortOrder: 1 }]);
  });

  it('연결할 예전 행도 없으면 새로 만든다(정렬순서는 대표원장 0, 부원장 1)', () => {
    const plan = planDoctorSync([staff({ id: 's-new', name: '새부원장', grade: '부원장' })], []);
    expect(plan.insert).toEqual([{ name: '새부원장', staffId: 's-new', sortOrder: 1 }]);
  });

  it('강등(등급만 바뀜, staff 행은 그대로): staff_id 가 남아 있는 행은 자격을 잃으면 숨긴다', () => {
    const plan = planDoctorSync([], [row({ id: 'd1', staffId: 's1', active: true })]);
    expect(plan.update).toEqual([{ id: 'd1', active: false }]);
  });

  it('퇴사(실제 흐름): staff 행이 통째로 지워지면 on delete set null 로 doctors.staff_id 도 이미 null이라, ' +
    'staffId 매칭만으로는 더 이상 찾을 수 없다 — justRemovedDoctorIds 없이는 숨겨지지 않는다(그래서 호출자가 넘겨야 한다)', () => {
    const plan = planDoctorSync([], [row({ id: 'd1', staffId: null, name: '퇴사원장', active: true })]);
    expect(plan.update).toEqual([]);
  });

  it('퇴사(실제 흐름): 지우기 전에 미리 알아둔 진료의 행 id(justRemovedDoctorIds)를 넘기면, staff_id가 이미 null이어도 확실히 숨긴다', () => {
    const plan = planDoctorSync([], [row({ id: 'd1', staffId: null, name: '퇴사원장', active: true })], ['d1']);
    expect(plan.update).toEqual([{ id: 'd1', active: false }]);
  });

  it('justRemovedDoctorIds에 있어도 이미 비활성이면 다시 건드리지 않는다', () => {
    const plan = planDoctorSync([], [row({ id: 'd1', staffId: null, name: '퇴사원장', active: false })], ['d1']);
    expect(plan.update).toEqual([]);
  });

  it('이미 숨겨진 행은 다시 건드리지 않는다', () => {
    const plan = planDoctorSync([], [row({ id: 'd1', staffId: 's1', active: false })]);
    expect(plan.update).toEqual([]);
  });

  it('숨겨졌던 진료의가 다시 자격을 얻으면 되살린다', () => {
    const plan = planDoctorSync([staff({ id: 's1', name: '복귀원장', grade: '부원장' })], [row({ id: 'd1', staffId: 's1', name: '복귀원장', active: false, sortOrder: 1 })]);
    expect(plan.update).toEqual([{ id: 'd1', active: true }]);
  });

  it('staff_id 없는 행이 여러 개라도 각 이름에 한 번씩만 연결한다', () => {
    const plan = planDoctorSync(
      [staff({ id: 's1', name: '박소은', grade: '부원장' })],
      [row({ id: 'd1', staffId: null, name: '박소은' }), row({ id: 'd2', staffId: null, name: '박소은' })]
    );
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].id).toBe('d1');
  });

  it('실제 시나리오: 김동규(이미 연결)는 그대로, 박소은(이름만 있던 행)은 새 계정에 연결', () => {
    const plan = planDoctorSync(
      [staff({ id: 's-kim', name: '김동규', grade: '대표원장' }), staff({ id: 's-park', name: '박소은', grade: '부원장' })],
      [row({ id: 'd-kim', staffId: 's-kim', name: '김동규', sortOrder: 0 }), row({ id: 'd-park', staffId: null, name: '박소은', sortOrder: 1 })]
    );
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([{ id: 'd-park', staffId: 's-park', active: true, sortOrder: 1 }]);
  });

  it('한 번의 호출에서: staff_id로 이미 연결된 진료의는 그대로 두고, 방금 퇴사한(justRemovedDoctorIds) 다른 진료의만 숨긴다', () => {
    const plan = planDoctorSync(
      [staff({ id: 's-kim', name: '김동규', grade: '대표원장' })],
      [
        row({ id: 'd-kim', staffId: 's-kim', name: '김동규', active: true, sortOrder: 0 }),
        row({ id: 'd-removed', staffId: null, name: '퇴사원장', active: true }),
      ],
      ['d-removed']
    );
    expect(plan.update).toEqual([{ id: 'd-removed', active: false }]);
  });

  it('퇴사한 사람과 이름이 같은 새 직원이 같은 호출에서 승인돼도, 퇴사 처리 중(숨길 예정)인 행에 재연결되지 않고 새 행을 만든다' +
    '(순서 의존 버그: 재연결 후 바로 숨김 루프에서 다시 꺼지는 것을 막는다)', () => {
    const plan = planDoctorSync(
      [staff({ id: 's-new', name: '박소은', grade: '부원장' })],
      [row({ id: 'd-old', staffId: null, name: '박소은', active: true })],
      ['d-old']
    );
    expect(plan.insert).toEqual([{ name: '박소은', staffId: 's-new', sortOrder: 1 }]);
    expect(plan.update).toEqual([{ id: 'd-old', active: false }]);
  });
});
