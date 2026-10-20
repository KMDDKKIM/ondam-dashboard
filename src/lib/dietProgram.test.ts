import { describe, expect, it } from 'vitest';
import { dietPillStartDate, holidayClusters, medicineEndDate, ownerDueMessages, phaseLabel, type DietProgram } from './dietProgram';
import { fillScript, koDate, OWNER_SCRIPTS, scriptValues } from './dietScripts';

// 환자 이름은 시험용 값이다(공개 저장소).
function program(p: Partial<DietProgram> = {}): DietProgram {
  return {
    id: 'p1', patientName: '가나다', chartNo: '', phone: '', track: 'visit', firstDate: null, weeks: 12, paidAt: null, shippedAt: null,
    detoxStartDate: '2026-10-05', detoxDays: 3, medicineEndDate: null, revisitDate: null, lastRecordDate: null, lastDoctorContactDate: null,
    status: 'active', endedAt: null, memo: '', ...p,
  };
}
const codes = (list: ReturnType<typeof ownerDueMessages>) => list.map((m) => m.code);

describe('날짜 계산', () => {
  it('다이어트환 시작일 = 디톡스 시작일 + 일수, 약 소진 예정일 = 시작일 + 주수×7 − 1', () => {
    expect(dietPillStartDate(program())).toBe('2026-10-08');
    expect(medicineEndDate(program())).toBe('2026-12-27');
    expect(medicineEndDate(program({ medicineEndDate: '2026-12-01' }))).toBe('2026-12-01');
    expect(medicineEndDate(program({ detoxStartDate: null }))).toBeNull();
  });

  it('단계 표시', () => {
    expect(phaseLabel(program({ detoxStartDate: null }), '2026-10-10')).toBe('디톡스 시작일 미정');
    expect(phaseLabel(program(), '2026-10-03')).toBe('디톡스 시작 D-2');
    expect(phaseLabel(program(), '2026-10-06')).toBe('디톡스 2일차');
    expect(phaseLabel(program(), '2026-10-08')).toBe('다이어트환 1주차 (1일째)');
    expect(phaseLabel(program(), '2026-10-15')).toBe('다이어트환 2주차 (8일째)');
    expect(phaseLabel(program({ status: 'ended' }), '2026-10-15')).toBe('종료');
  });
});

describe('ownerDueMessages — 원장 카톡', () => {
  it('매주 월요일 문안은 월요일에만, 복용 중인 환자에게', () => {
    const monday = '2026-10-19';
    expect(codes(ownerDueMessages([program()], monday, []))).toContain('weekly');
    expect(codes(ownerDueMessages([program()], '2026-10-20', []))).not.toContain('weekly');
    // 아직 디톡스 시작 전이면 안 보낸다
    expect(codes(ownerDueMessages([program({ detoxStartDate: '2026-10-25' })], monday, []))).not.toContain('weekly');
  });

  it('다이어트환 시작 다음 날 안부(공3)', () => {
    expect(codes(ownerDueMessages([program()], '2026-10-09', []))).toContain('pill-day1');
    expect(codes(ownerDueMessages([program()], '2026-10-08', []))).not.toContain('pill-day1');
  });

  it('약 소진 4일 전 연복 권유(공9)는 그날부터 4일간', () => {
    expect(codes(ownerDueMessages([program()], '2026-12-23', []))).toContain('refill');
    expect(codes(ownerDueMessages([program()], '2026-12-22', []))).not.toContain('refill');
    expect(codes(ownerDueMessages([program()], '2026-12-27', []))).toContain('refill');
  });

  it('보냈거나 건너뛴 것은 다시 안 뜬다', () => {
    const sends = [{ programId: 'p1', code: 'refill', dueDate: '2026-12-23' }];
    expect(codes(ownerDueMessages([program()], '2026-12-24', sends))).not.toContain('refill');
  });

  it('종료된 환자는 아무것도 안 뜬다', () => {
    expect(ownerDueMessages([program({ status: 'ended' })], '2026-12-24', [])).toEqual([]);
  });

  it('기록이 3일 끊기면 안부(공7), 기록이 하루 안이고 원장 연락 3일이면 안부(공4)', () => {
    expect(codes(ownerDueMessages([program({ lastRecordDate: '2026-10-12' })], '2026-10-15', []))).toContain('no-record');
    expect(codes(ownerDueMessages([program({ lastRecordDate: '2026-10-13' })], '2026-10-15', []))).not.toContain('no-record');
    const p = program({ lastRecordDate: '2026-10-15', lastDoctorContactDate: '2026-10-12' });
    expect(codes(ownerDueMessages([p], '2026-10-15', []))).toContain('checkin');
    expect(codes(ownerDueMessages([program({ lastRecordDate: '2026-10-13', lastDoctorContactDate: '2026-10-12' })], '2026-10-15', []))).not.toContain('checkin');
  });

  it('재진일: 대면은 단계 전환 안내, 비대면은 재처방 안내', () => {
    expect(codes(ownerDueMessages([program({ revisitDate: '2026-11-01' })], '2026-11-01', []))).toContain('visit-revisit');
    expect(codes(ownerDueMessages([program({ track: 'remote', revisitDate: '2026-11-01' })], '2026-11-01', []))).toContain('remote-second');
  });

  it('비대면은 약 소진 10일 전이 지났는데 2차 상담이 안 잡히면 안부(비9)', () => {
    const p = program({ track: 'remote', medicineEndDate: '2026-11-20' });
    expect(codes(ownerDueMessages([p], '2026-11-11', []))).toContain('remote-nudge');
    expect(codes(ownerDueMessages([{ ...p, revisitDate: '2026-11-15' }], '2026-11-11', []))).not.toContain('remote-nudge');
    expect(codes(ownerDueMessages([program({ medicineEndDate: '2026-11-20' })], '2026-11-11', []))).not.toContain('remote-nudge');
  });

  it('연휴 하루 전 공지(공10)', () => {
    const holidays = ['2026-09-24', '2026-09-25', '2026-09-26'];
    const p = program({ detoxStartDate: '2026-09-01', weeks: 12 });
    expect(codes(ownerDueMessages([p], '2026-09-23', [], holidays))).toContain('holiday');
    expect(codes(ownerDueMessages([p], '2026-09-22', [], holidays))).not.toContain('holiday');
  });

  it('많이 밀린 것이 위로', () => {
    const a = program({ id: 'a', patientName: '가', medicineEndDate: '2026-11-20' }); // refill 11/16, 오늘 11/18 → 2일 밀림
    const b = program({ id: 'b', patientName: '나', medicineEndDate: '2026-11-22' }); // refill 11/18 → 오늘
    expect(ownerDueMessages([b, a], '2026-11-18', []).filter((m) => m.code === 'refill').map((m) => m.programId)).toEqual(['a', 'b']);
  });
});

describe('holidayClusters', () => {
  it('연속한 휴진일을 한 덩어리로 묶는다', () => {
    expect(holidayClusters(['2026-09-26', '2026-09-24', '2026-09-25', '2027-02-07'])).toEqual([
      { start: '2026-09-24', end: '2026-09-26' },
      { start: '2027-02-07', end: '2027-02-07' },
    ]);
  });
});

describe('카톡 문구', () => {
  it('아는 칸만 채우고 모르는 칸은 그대로 둔다', () => {
    const text = fillScript(OWNER_SCRIPTS['remote-second'], { 이름: '가나다', 원장명: '김' });
    expect(text).toContain('가나다님 김 원장입니다.');
    expect(text).toContain('{단계}');
    expect(text).toContain('{다음상담일}');
  });

  it('연휴 공지는 연휴 이름·기간·진료 재개일을 채운다', () => {
    const v = scriptValues(program(), 'holiday', '김', '2026-09-23');
    const text = fillScript(OWNER_SCRIPTS.holiday, v);
    expect(text).toContain('추석 연휴 9월 24일(목)~9월 26일(토) 쉬고 9월 27일(일)부터');
    expect(text).toContain('{영상링크}');
  });

  it('koDate', () => {
    expect(koDate('2026-10-19')).toBe('10월 19일(월)');
  });
});
