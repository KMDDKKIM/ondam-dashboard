import { describe, expect, it } from 'vitest';
import { deskCallNote, deskCodeFromNote, deskNoteDisplay, deskStageRank, needsConsultDoneCall, dietPillStartDate, holidayClusters, medicineEndDate, ownerDueMessages, phaseLabel, planDeskSync, scheduledDeskCalls, type DietProgram } from './dietProgram';
import { deskScriptForNote, deskScriptText, fillScript, koDate, OWNER_SCRIPTS, scriptValues } from './dietScripts';

// 환자 이름은 시험용 값이다(공개 저장소).
function program(p: Partial<DietProgram> = {}): DietProgram {
  return {
    id: 'p1', patientName: '가나다', chartNo: '', phone: '', track: 'visit', firstDate: null, weeks: 12, paidAt: null, shippedAt: null,
    detoxStartDate: '2026-10-05', detoxDays: 3, medicineEndDate: null, revisitDate: null, lastDoctorContactDate: null,
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

describe('기록 기반 연락은 자동으로 만들지 않는다(원장 결정)', () => {
  it('기록이 끊기거나 잘 올라와도 원장 카톡이 생기지 않는다', () => {
    const list = ownerDueMessages([program({ detoxStartDate: '2026-10-12', weeks: 12 })], '2026-10-15', []);
    expect(codes(list)).not.toContain('no-record' as never);
    expect(codes(list)).not.toContain('checkin' as never);
  });
});

describe('scheduledDeskCalls — 날짜로 정해지는 데스크 해피콜', () => {
  it('디톡스 전날, 다이어트환 시작일, 약 소진 10일 전', () => {
    const calls = scheduledDeskCalls(program()); // 디톡스 10/5, 3일 → 환 시작 10/8, 12주 → 약 소진 12/27
    const get = (code: string) => calls.filter((c) => c.code === code).map((c) => c.callDate);
    expect(get('detox-eve')).toEqual(['2026-10-04']);
    expect(get('pill-start')).toEqual(['2026-10-08']);
    expect(get('reorder')).toEqual(['2026-12-17']);
  });

  it('월초 안부는 다이어트환 시작 뒤 약 소진 예정일까지의 매월 1일', () => {
    const monthly = scheduledDeskCalls(program()).filter((c) => c.code === 'monthly').map((c) => c.callDate);
    expect(monthly).toEqual(['2026-11-01', '2026-12-01']);
  });

  it('디톡스 시작일이 없으면 아무것도 만들지 않는다', () => {
    expect(scheduledDeskCalls(program({ detoxStartDate: null }))).toEqual([]);
  });

  it('해가 바뀌는 프로그램도 월초 안부가 이어진다', () => {
    const monthly = scheduledDeskCalls(program({ detoxStartDate: '2026-11-20', weeks: 12 })).filter((c) => c.code === 'monthly').map((c) => c.callDate);
    expect(monthly).toEqual(['2026-12-01', '2027-01-01', '2027-02-01']);
  });
});

describe('planDeskSync', () => {
  const desired = [
    { code: 'detox-eve' as const, callDate: '2026-10-04' },
    { code: 'pill-start' as const, callDate: '2026-10-08' },
  ];

  it('없는 것만 만들고, 지난 날짜는 새로 만들지 않는다', () => {
    expect(planDeskSync(desired, [], '2026-10-06')).toEqual([{ type: 'create', code: 'pill-start', callDate: '2026-10-08' }]);
    expect(planDeskSync(desired, [], '2026-10-01')).toHaveLength(2);
  });

  it('이미 있는 것은 그대로 둔다', () => {
    const existing = [{ code: 'pill-start', callDate: '2026-10-08', entryId: 'e1', touched: false }];
    expect(planDeskSync(desired, existing, '2026-10-06')).toEqual([]);
  });

  it('날짜가 바뀌어 필요 없어진 것은 손대지 않았을 때만 지운다', () => {
    const existing = [
      { code: 'pill-start', callDate: '2026-10-09', entryId: 'e1', touched: false },
      { code: 'detox-eve', callDate: '2026-10-03', entryId: 'e2', touched: true },
    ];
    const ops = planDeskSync(desired, existing, '2026-10-06');
    expect(ops).toContainEqual({ type: 'remove', entryId: 'e1' });
    expect(ops).not.toContainEqual({ type: 'remove', entryId: 'e2' });
    expect(ops).toContainEqual({ type: 'create', code: 'pill-start', callDate: '2026-10-08' });
  });
});

describe('데스크 해피콜 문구', () => {
  it('해피콜 문구(note)로 단계를 알아낸다', () => {
    expect(deskCodeFromNote(deskCallNote('detox-eve', 'visit'))).toBe('detox-eve');
    expect(deskCodeFromNote(deskCallNote('reorder', 'remote'))).toBe('reorder');
    expect(deskCodeFromNote('린다이어트 · 모르는 문구')).toBeNull();
    expect(deskCodeFromNote('한약 수령확인')).toBeNull();
  });

  it('대면/비대면 문구를 구분하고 이름·코디명·월을 채운다', () => {
    expect(deskScriptForNote(deskCallNote('reorder', 'visit'))).toContain('내원 가능하신 날짜');
    expect(deskScriptForNote(deskCallNote('reorder', 'remote'))).toContain('통화 편하신 시간');
    const text = deskScriptText(deskCallNote('monthly', 'visit'), '가나다', '코디A', '2026-11-01') as string;
    expect(text).toContain('가나다님~ 코디 코디A입니다');
    expect(text).toContain('어느새 11월이네요! 10월 한 달도');
  });

  it('1월 안부는 전월이 12월', () => {
    expect(deskScriptText(deskCallNote('monthly', 'visit'), '가', '나', '2027-01-01')).toContain('12월 한 달도');
  });
});

describe('같은 날 데스크 해피콜 순서와 표시', () => {
  it('진료 후 → 결제 → 송장 → … 순서 번호', () => {
    const order = (['consult-done', 'paid', 'shipped', 'detox-eve', 'reorder', 'finish'] as const).map((c) => deskStageRank(deskCallNote(c, 'visit')));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(deskStageRank('한약 수령확인')).toBeGreaterThan(deskStageRank(deskCallNote('finish', 'visit')));
  });

  it('목록에는 앞머리를 뺀 문구를 보여 준다', () => {
    expect(deskNoteDisplay(deskCallNote('monthly', 'visit'))).toBe('월초 안부');
    expect(deskNoteDisplay('한약 수령확인')).toBe('한약 수령확인');
    expect(deskNoteDisplay(null)).toBe('');
  });
});

describe('needsConsultDoneCall — 진료 후 안내를 올릴지', () => {
  it('디톡스 시작 전(또는 오늘 시작, 또는 시작일 모름)이면 올린다', () => {
    expect(needsConsultDoneCall('2026-10-23', '2026-10-20')).toBe(true);
    expect(needsConsultDoneCall('2026-10-20', '2026-10-20')).toBe(true);
    expect(needsConsultDoneCall(null, '2026-10-20')).toBe(true);
    expect(needsConsultDoneCall('', '2026-10-20')).toBe(true);
  });

  it('디톡스를 이미 시작한(진행 중인) 환자는 올리지 않는다', () => {
    expect(needsConsultDoneCall('2026-10-19', '2026-10-20')).toBe(false);
    expect(needsConsultDoneCall('2026-09-01', '2026-10-20')).toBe(false);
  });
});
