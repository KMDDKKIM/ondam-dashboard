import { describe, expect, it } from 'vitest';
import {
  deskCallNote,
  deskCodeFromNote,
  deskNoteDisplay,
  deskStageRank,
  dietPillStartDate,
  holidayClusters,
  isDietProgramPurchase,
  LATER_OWNER_MESSAGES,
  medicineEndDate,
  ownerDueMessages,
  phaseLabel,
  planDeskSync,
  scheduledDeskCalls,
  type DietProgram,
} from './dietProgram';
import { deskScriptForNote, deskScriptText, fillScript, koDate, OWNER_SCRIPTS, scriptValues } from './dietScripts';

// 환자 이름은 시험용 값이다(공개 저장소).
function program(p: Partial<DietProgram> = {}): DietProgram {
  return {
    id: 'p1', patientName: '가나다', chartNo: '', phone: '', track: 'visit', firstDate: null, weeks: 12, paidAt: null, shippedAt: null,
    detoxStartDate: '2026-10-05', detoxDays: 3, medicineEndDate: null, revisitDate: null, lastDoctorContactDate: null,
    status: 'active', endedAt: null, memo: '', purchaseId: null, ...p,
  };
}
const codes = (list: ReturnType<typeof ownerDueMessages>) => list.map((m) => m.code);
const later = { later: true };
const weeklyOnly = (p: DietProgram, today: string) => codes(ownerDueMessages([p], today, [])).includes('weekly');

describe('isDietProgramPurchase — 린다이어트 프로그램이 만들어지는 결제', () => {
  it('목표 반영이 다이어트이고 상품명에 린다이어트가 있어야 한다', () => {
    expect(isDietProgramPurchase('린다이어트', 'diet')).toBe(true);
    expect(isDietProgramPurchase('린 다이어트 12주', 'diet')).toBe(true);
    expect(isDietProgramPurchase('린데일리', 'diet')).toBe(false);
    expect(isDietProgramPurchase('린다이어트', null)).toBe(false);
    expect(isDietProgramPurchase('일반한약', 'herb')).toBe(false);
  });
});

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
  it('지금은 다이어트환 시작일 안부와 첫 4주의 월요일 문안만 자동으로 올라간다(그 밖의 일정은 꺼 둠)', () => {
    expect(LATER_OWNER_MESSAGES).toBe(false);
    expect(codes(ownerDueMessages([program()], '2026-10-08', []))).toEqual(['pill-start']);
    expect(codes(ownerDueMessages([program()], '2026-12-23', []))).toEqual([]); // 연복 권유는 만들지 않는다
  });

  it('월요일 문안: 다이어트환 시작 다음 날부터 4주(28일) 동안의 월요일에만', () => {
    // 디톡스 10/5 → 환 시작 10/8(목). 4주 = 10/8 ~ 11/4
    expect(codes(ownerDueMessages([program()], '2026-10-12', []))).toEqual(['weekly']); // 월
    expect(codes(ownerDueMessages([program()], '2026-11-02', []))).toEqual(['weekly']); // 월, 마지막 주
    expect(codes(ownerDueMessages([program()], '2026-11-09', []))).toEqual([]); // 4주 지난 월요일
    expect(codes(ownerDueMessages([program()], '2026-10-13', []))).toEqual([]); // 화요일
    expect(weeklyOnly(program({ detoxStartDate: '2026-10-05' }), '2026-10-05')).toBe(false); // 아직 환 시작 전 월요일
  });

  it('다이어트환 시작일이 월요일이면 그날은 시작 안부만(월요일 문안과 겹치지 않는다)', () => {
    // 디톡스 10/2 → 환 시작 10/5(월)
    expect(codes(ownerDueMessages([program({ detoxStartDate: '2026-10-02' })], '2026-10-05', []))).toEqual(['pill-start']);
  });

  it('다이어트환 시작일부터 이틀간 보이고, 그 전·그 뒤에는 안 보인다', () => {
    expect(codes(ownerDueMessages([program()], '2026-10-07', []))).toEqual([]);
    expect(codes(ownerDueMessages([program()], '2026-10-09', []))).toEqual(['pill-start']);
    expect(codes(ownerDueMessages([program()], '2026-10-11', []))).toEqual([]);
  });

  it('보냈거나 건너뛴 것은 다시 안 뜬다, 종료된 환자는 안 뜬다', () => {
    const sends = [{ programId: 'p1', code: 'pill-start', dueDate: '2026-10-08' }];
    expect(ownerDueMessages([program()], '2026-10-09', sends)).toEqual([]);
    expect(ownerDueMessages([program({ status: 'ended' })], '2026-10-08', [])).toEqual([]);
  });

  it('디톡스 시작일이 없으면 아무것도 안 뜬다', () => {
    expect(ownerDueMessages([program({ detoxStartDate: null })], '2026-10-08', [])).toEqual([]);
  });

  // ---- 꺼 둔 규칙(나중에 켤 때를 위해 규칙 자체는 계속 시험한다) ----
  it('[later] 다이어트환 시작 다음 날 안부(공3)', () => {
    expect(codes(ownerDueMessages([program()], '2026-10-09', [], undefined, later))).toContain('pill-day1');
  });

  it('[later] 약 소진 4일 전 연복 권유(공9)는 그날부터 4일간', () => {
    expect(codes(ownerDueMessages([program()], '2026-12-23', [], undefined, later))).toContain('refill');
    expect(codes(ownerDueMessages([program()], '2026-12-22', [], undefined, later))).not.toContain('refill');
  });

  it('[later] 재진일: 대면은 단계 전환 안내, 비대면은 재처방 안내', () => {
    expect(codes(ownerDueMessages([program({ revisitDate: '2026-11-01' })], '2026-11-01', [], undefined, later))).toContain('visit-revisit');
    expect(codes(ownerDueMessages([program({ track: 'remote', revisitDate: '2026-11-01' })], '2026-11-01', [], undefined, later))).toContain('remote-second');
  });

  it('[later] 연휴 하루 전 공지(공10)', () => {
    const holidays = ['2026-09-24', '2026-09-25', '2026-09-26'];
    const p = program({ detoxStartDate: '2026-09-01', weeks: 12 });
    expect(codes(ownerDueMessages([p], '2026-09-23', [], holidays, later))).toContain('holiday');
    expect(codes(ownerDueMessages([p], '2026-09-22', [], holidays, later))).not.toContain('holiday');
  });

  it('많이 밀린 것이 위로', () => {
    const a = program({ id: 'a', patientName: '가', detoxStartDate: '2026-10-05' }); // 환 시작 10/8, 오늘 10/9 → 1일 밀림
    const b = program({ id: 'b', patientName: '나', detoxStartDate: '2026-10-06' }); // 환 시작 10/9 → 오늘
    expect(ownerDueMessages([b, a], '2026-10-09', []).map((m) => m.programId)).toEqual(['a', 'b']);
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

describe('scheduledDeskCalls — 디톡스 3일 데스크 해피콜', () => {
  it('디톡스 시작일, 다음날, 다다음날', () => {
    expect(scheduledDeskCalls(program())).toEqual([
      { code: 'detox-day1', callDate: '2026-10-05' },
      { code: 'detox-day2', callDate: '2026-10-06' },
      { code: 'detox-day3', callDate: '2026-10-07' },
    ]);
  });

  it('월말·연말을 넘겨도 날짜가 이어진다', () => {
    expect(scheduledDeskCalls(program({ detoxStartDate: '2026-12-30' })).map((c) => c.callDate)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  it('디톡스 시작일이 없으면 만들지 않는다', () => {
    expect(scheduledDeskCalls(program({ detoxStartDate: null }))).toEqual([]);
  });
});

describe('planDeskSync', () => {
  const desired = scheduledDeskCalls(program());

  it('없는 것만 만들고, 지난 날짜는 새로 만들지 않는다', () => {
    expect(planDeskSync(desired, [], '2026-10-06')).toEqual([
      { type: 'create', code: 'detox-day2', callDate: '2026-10-06' },
      { type: 'create', code: 'detox-day3', callDate: '2026-10-07' },
    ]);
    expect(planDeskSync(desired, [], '2026-10-01')).toHaveLength(3);
  });

  it('이미 있는 것은 그대로 둔다', () => {
    const existing = [{ code: 'detox-day2', callDate: '2026-10-06', entryId: 'e1', touched: false }];
    expect(planDeskSync(desired, existing, '2026-10-06')).toEqual([{ type: 'create', code: 'detox-day3', callDate: '2026-10-07' }]);
  });

  it('날짜가 바뀌어 필요 없어진 것은 손대지 않았을 때만 지운다', () => {
    const existing = [
      { code: 'detox-day2', callDate: '2026-10-09', entryId: 'e1', touched: false },
      { code: 'detox-day3', callDate: '2026-10-08', entryId: 'e2', touched: true },
    ];
    const ops = planDeskSync(desired, existing, '2026-10-06');
    expect(ops).toContainEqual({ type: 'remove', entryId: 'e1' });
    expect(ops).not.toContainEqual({ type: 'remove', entryId: 'e2' });
  });
});

describe('데스크 해피콜 문구와 순서', () => {
  it('해피콜 문구(note)로 단계를 알아낸다', () => {
    expect(deskCodeFromNote(deskCallNote('detox-day1'))).toBe('detox-day1');
    expect(deskCodeFromNote(deskCallNote('detox-day3'))).toBe('detox-day3');
    expect(deskCodeFromNote('린다이어트 · 모르는 문구')).toBeNull();
    expect(deskCodeFromNote('한약 수령확인')).toBeNull();
  });

  it('예약 전날 리마인드는 뒤에 예약 정보가 붙어도 알아본다', () => {
    expect(deskCodeFromNote(deskCallNote('reservation-reminder', '10/23 14:30'))).toBe('reservation-reminder');
    expect(deskCodeFromNote(deskCallNote('reservation-reminder'))).toBe('reservation-reminder');
    expect(deskNoteDisplay(deskCallNote('reservation-reminder', '10/23 14:30'))).toBe('예약 전날 리마인드 (10/23 14:30)');
  });

  it('예약 리마인드 문구는 예약 날짜·시간을 채운다', () => {
    const text = deskScriptText(deskCallNote('reservation-reminder', '10/23 14:30'), '가나다', '코디A', '2026-10-22') as string;
    expect(text).toContain('가나다님🥰 내일 10월 23일 14:30 예약 잊지 않으셨죠?');
  });

  it('같은 날 순서 번호와 목록 표시', () => {
    expect(deskStageRank(deskCallNote('detox-day1'))).toBeLessThan(deskStageRank(deskCallNote('detox-day3')));
    expect(deskStageRank('한약 수령확인')).toBeGreaterThan(deskStageRank(deskCallNote('detox-day3')));
    expect(deskNoteDisplay(deskCallNote('detox-day2'))).toBe('디톡스 2일차 컨디션 확인');
    expect(deskNoteDisplay('한약 수령확인')).toBe('한약 수령확인');
    expect(deskNoteDisplay(null)).toBe('');
  });

  it('문구에 이름·코디명을 채우고 나머지 칸은 남긴다', () => {
    const text = deskScriptText(deskCallNote('detox-day2'), '가나다', '코디A', '2026-10-06') as string;
    expect(text).toContain('가나다님, 안녕하세요~ 코디 코디A입니다');
    const first = deskScriptText(deskCallNote('detox-day1'), '가나다', '코디A', '2026-10-05') as string;
    expect(first).toContain('{디톡스환}');
    expect(deskScriptForNote('한약 수령확인')).toBeNull();
  });
});

describe('원장 카톡 문구', () => {
  it('다이어트환 시작일 문구에 이름·원장명을 채운다', () => {
    const text = fillScript(OWNER_SCRIPTS['pill-start'], { 이름: '가나다', 원장명: '김' });
    expect(text).toContain('가나다님 김 원장입니다');
    expect(text).toContain('채소 먼저');
  });

  it('아는 칸만 채우고 모르는 칸은 그대로 둔다', () => {
    const text = fillScript(OWNER_SCRIPTS['remote-second'], { 이름: '가나다', 원장명: '김' });
    expect(text).toContain('{단계}');
  });

  it('연휴 공지는 연휴 이름·기간·진료 재개일을 채운다', () => {
    const v = scriptValues(program(), 'holiday', '김', '2026-09-23');
    const text = fillScript(OWNER_SCRIPTS.holiday, v);
    expect(text).toContain('추석 연휴 9월 24일(목)~9월 26일(토) 쉬고 9월 27일(일)부터');
  });

  it('koDate', () => {
    expect(koDate('2026-10-19')).toBe('10월 19일(월)');
  });
});
