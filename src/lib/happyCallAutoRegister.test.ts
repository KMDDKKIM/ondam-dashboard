import { describe, expect, it } from 'vitest';
import { matchDoctorId, pickCandidateInfo, planBirthFill, planReceptionRegistrations, skipKey, type ReceptionEntry } from './happyCallAutoRegister';

// 이름·생년월일은 모두 시험용 가짜 값이다(실제 환자 정보를 넣지 않는다).
const entry = (o: Partial<ReceptionEntry> = {}): ReceptionEntry => ({
  visitDate: '2026-09-25',
  patientName: '가나다',
  birthDate: '80.1.1',
  visitKind: '초진',
  excluded: false,
  ...o,
});
const TODAY = '2026-10-03';

describe('planReceptionRegistrations', () => {
  it('초진·재초진을 올린다', () => {
    const plan = planReceptionRegistrations([entry(), entry({ patientName: '라마바', visitKind: '재초진', visitDate: '2026-09-26' })], [], new Set(), TODAY);
    expect(plan).toEqual([
      { patientName: '가나다', birthDate: '80.1.1', firstVisitDate: '2026-09-25', visitKind: '초진' },
      { patientName: '라마바', birthDate: '80.1.1', firstVisitDate: '2026-09-26', visitKind: '재초진' },
    ]);
  });

  it('재진·제외 접수는 올리지 않는다', () => {
    expect(planReceptionRegistrations([entry({ visitKind: '재진' }), entry({ patientName: '라마바', excluded: true })], [], new Set(), TODAY)).toEqual([]);
  });

  it('이미 같은 날 같은 이름으로 등록돼 있으면 올리지 않는다', () => {
    expect(planReceptionRegistrations([entry()], [{ patientName: '가나다', firstVisitDate: '2026-09-25' }], new Set(), TODAY)).toEqual([]);
  });

  it('같은 이름이라도 다른 날 초진이면 올린다', () => {
    expect(planReceptionRegistrations([entry()], [{ patientName: '가나다', firstVisitDate: '2026-08-01' }], new Set(), TODAY)).toHaveLength(1);
  });

  it('직원이 지운 사람(건너뛰기 기록)은 다시 올리지 않는다', () => {
    expect(planReceptionRegistrations([entry()], [], new Set([skipKey('2026-09-25', '가나다')]), TODAY)).toEqual([]);
  });

  it('같은 날 같은 이름이 두 줄이면 한 명만 올리고, 이름 앞뒤 공백은 무시한다', () => {
    const plan = planReceptionRegistrations([entry(), entry({ patientName: ' 가나다 ' })], [], new Set(), TODAY);
    expect(plan).toHaveLength(1);
  });

  it('오늘 이후 날짜·이름이 빈 줄은 뺀다', () => {
    expect(planReceptionRegistrations([entry({ visitDate: '2026-10-04' }), entry({ patientName: '  ' })], [], new Set(), TODAY)).toEqual([]);
  });

  it('생년월일이 비어 있으면 null로 올린다', () => {
    expect(planReceptionRegistrations([entry({ birthDate: ' ' })], [], new Set(), TODAY)[0].birthDate).toBeNull();
  });
});

describe('planBirthFill', () => {
  const p = (o = {}) => ({ id: 'p1', patientName: '가나다', firstVisitDate: '2026-09-25', birthDate: null, ...o });

  it('초진일 접수 기록의 생년월일을 채운다', () => {
    expect(planBirthFill([p()], [entry()])).toEqual([{ id: 'p1', birthDate: '80.1.1' }]);
  });

  it('이미 있으면 건드리지 않는다', () => {
    expect(planBirthFill([p({ birthDate: '70.7.7' })], [entry()])).toEqual([]);
  });

  it('그날 같은 이름의 생년월일이 둘이면 건너뛴다', () => {
    expect(planBirthFill([p()], [entry(), entry({ birthDate: '55.5.5' })])).toEqual([]);
  });

  it('접수 기록에 생년월일이 없으면 채우지 않는다', () => {
    expect(planBirthFill([p()], [entry({ birthDate: null })])).toEqual([]);
  });
});

describe('planBirthFill 동명 보호', () => {
  it('같은 날 같은 이름으로 등록된 환자가 둘이면 건너뛴다', () => {
    const p = (id: string) => ({ id, patientName: '가나다', firstVisitDate: '2026-09-25', birthDate: null });
    expect(planBirthFill([p('a'), p('b')], [entry()])).toEqual([]);
  });
});

describe('pickCandidateInfo', () => {
  const c = (o = {}) => ({ patientName: '가나다', chartNo: '1001', phone: '010-0000-0001', doctorName: '김동규', ...o });

  it('같은 이름 후보 한 명의 차트번호·연락처·진료의를 가져온다', () => {
    expect(pickCandidateInfo('가나다', [c(), c({ patientName: '라마바', chartNo: '1002' })])).toEqual({ chartNo: '1001', phone: '010-0000-0001', doctorName: '김동규' });
  });

  it('차트번호가 다른 같은 이름이 둘이면 못 고른다', () => {
    expect(pickCandidateInfo('가나다', [c(), c({ chartNo: '1002' })])).toBeNull();
  });

  it('차트번호가 없는 후보(접수기록부에서 온 이름뿐인 후보)는 쓰지 않는다', () => {
    expect(pickCandidateInfo('가나다', [c({ chartNo: '', phone: '', doctorName: '' })])).toBeNull();
  });

  it('같은 차트가 두 번 나오면 비어 있는 값은 다른 줄에서 채운다', () => {
    expect(pickCandidateInfo('가나다', [c({ phone: '' }), c({ doctorName: '' })])).toEqual({ chartNo: '1001', phone: '010-0000-0001', doctorName: '김동규' });
  });
});

describe('matchDoctorId', () => {
  const staff = [{ id: 'a', name: '김동규' }, { id: 'b', name: '박소은' }];

  it('이름이 같으면 그 진료의', () => {
    expect(matchDoctorId('김동규', staff)).toBe('a');
  });

  it('"김동규원장"처럼 이름이 포함되면 하나로 정해질 때만', () => {
    expect(matchDoctorId('박소은 원장', staff)).toBe('b');
    expect(matchDoctorId('원장', [{ id: 'a', name: '원장 A' }, { id: 'b', name: '원장 B' }])).toBe('');
  });

  it('빈 이름은 빈 문자열', () => {
    expect(matchDoctorId('', staff)).toBe('');
  });
});
