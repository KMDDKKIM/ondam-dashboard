import { describe, expect, it } from 'vitest';
import { buildLeaveEditPatch, type LeaveRequestEdit } from './leave';

const NOW = new Date('2026-10-05T03:00:00Z');
const edit: LeaveRequestEdit = { startDate: '2026-10-12', endDate: '2026-10-12', halfDay: 'pm', kind: 'annual', memo: '병원' };

describe('buildLeaveEditPatch', () => {
  it('직원이 고치면 승인 대기로 돌리고 결정 기록을 지운다', () => {
    const patch = buildLeaveEditPatch(edit, { id: 'me', isOwner: false, currentStatus: 'approved' }, NOW);
    expect(patch).toMatchObject({ status: 'pending', decided_by: null, decided_at: null, decision_note: null, start_date: '2026-10-12', half_day: 'pm', kind: 'annual', memo: '병원' });
  });

  it('원장이 확정된 건을 고치면 상태는 두고 결정 기록만 갱신한다', () => {
    const patch = buildLeaveEditPatch(edit, { id: 'owner', isOwner: true, currentStatus: 'approved' }, NOW);
    expect(patch.status).toBeUndefined();
    expect(patch.decided_by).toBe('owner');
    expect(patch.decided_at).toBe('2026-10-05T03:00:00.000Z');
  });

  it('원장이 대기 중인 건을 고치면 결정 기록을 건드리지 않는다', () => {
    const patch = buildLeaveEditPatch(edit, { id: 'owner', isOwner: true, currentStatus: 'pending' }, NOW);
    expect(patch.status).toBeUndefined();
    expect(patch.decided_by).toBeUndefined();
  });

  it('기간이 하루가 아니면 반차를 비운다', () => {
    const patch = buildLeaveEditPatch({ ...edit, endDate: '2026-10-13' }, { id: 'me', isOwner: false, currentStatus: 'pending' }, NOW);
    expect(patch.half_day).toBeNull();
  });

  it('사유가 비면 null', () => {
    const patch = buildLeaveEditPatch({ ...edit, memo: '' }, { id: 'me', isOwner: false, currentStatus: 'pending' }, NOW);
    expect(patch.memo).toBeNull();
  });

  it('공휴일에는 반차를 비운다', () => {
    const patch = buildLeaveEditPatch({ ...edit, startDate: '2026-10-09', endDate: '2026-10-09', halfDay: 'am' }, { id: 'me', isOwner: false, currentStatus: 'pending' }, NOW);
    expect(patch.half_day).toBeNull();
  });
});
