import { describe, expect, it } from 'vitest';
import { groupTodayContacts, NEXT_CALL_PRESETS } from './careToday';
import type { DietProgram, DueMessage } from './dietProgram';
import { addDaysKst } from './kst';
import type { CarePatient } from './supabase/herbCare';

// 이름·번호는 시험용 값이다(공개 저장소).
function care(p: Partial<CarePatient>): CarePatient {
  return { id: 'c1', patientName: '가나다', chartNo: '', memo: '', status: 'active', endedAt: null, kind: 'diet', nextCallDate: '2026-10-26', lastCallDate: null, ...p };
}
function program(p: Partial<DietProgram>): DietProgram {
  return {
    id: 'p1', patientName: '가나다', chartNo: '', phone: '', track: 'visit', firstDate: null, weeks: 12, paidAt: null, shippedAt: null, detoxStartDate: '2026-10-23', detoxDays: 3,
    medicineEndDate: null, revisitDate: null, lastDoctorContactDate: null, status: 'active', endedAt: null, memo: '', purchaseId: null, ...p,
  };
}
const msg = (programId: string, overdueDays = 0): DueMessage => ({ programId, code: 'pill-start', dueDate: '2026-10-26', overdueDays });

describe('groupTodayContacts', () => {
  it('같은 환자의 해피콜 날짜와 카톡 차례는 한 칸으로 묶인다', () => {
    const r = groupTodayContacts([care({})], [msg('p1')], [program({})], '2026-10-26');
    expect(r).toHaveLength(1);
    expect(r[0].care?.id).toBe('c1');
    expect(r[0].messages).toHaveLength(1);
  });

  it('차트번호가 서로 다르면 동명이인으로 보고 따로 둔다', () => {
    const r = groupTodayContacts([care({ chartNo: '1111' })], [msg('p1')], [program({ chartNo: '2222' })], '2026-10-26');
    expect(r).toHaveLength(2);
  });

  it('케어 보드 환자가 아닌 프로그램만 있어도 카톡 차례가 한 칸으로 나온다', () => {
    const r = groupTodayContacts([], [msg('p1')], [program({})], '2026-10-26');
    expect(r).toHaveLength(1);
    expect(r[0].care).toBeNull();
  });

  it('프로그램을 못 찾는 카톡 차례는 버린다', () => {
    expect(groupTodayContacts([], [msg('없음')], [], '2026-10-26')).toEqual([]);
  });

  it('많이 밀린 사람이 위로, 같으면 이름순', () => {
    const r = groupTodayContacts(
      [care({ id: 'a', patientName: '나', nextCallDate: '2026-10-26' }), care({ id: 'b', patientName: '가', nextCallDate: '2026-10-26' }), care({ id: 'c', patientName: '다', nextCallDate: '2026-10-23' })],
      [],
      [],
      '2026-10-26'
    );
    expect(r.map((g) => g.patientName)).toEqual(['다', '가', '나']);
    expect(r[0].overdueDays).toBe(3);
  });
});

describe('NEXT_CALL_PRESETS', () => {
  it('빠른 선택 날짜', () => {
    expect(NEXT_CALL_PRESETS.map((p) => addDaysKst('2026-10-26', p.days))).toEqual(['2026-10-27', '2026-10-29', '2026-11-02', '2026-11-09', '2026-11-25']);
  });
});
