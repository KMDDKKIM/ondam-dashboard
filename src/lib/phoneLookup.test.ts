import { describe, it, expect } from 'vitest';
import { matchPhone, usablePhone, chartKey, type HistoryPhoneRow } from './phoneLookup';

const row = (chart_no: string, patient_name: string, phone: string | null): HistoryPhoneRow => ({ chart_no, patient_name, phone });
const NOTHING = { phone: null, source: null, ambiguous: false };
const AMBIG = { phone: null, source: null, ambiguous: true };

describe('usablePhone', () => {
  it('빈 값과 앞자리만 있는 번호는 쓰지 않는다', () => {
    expect(usablePhone(null)).toBeNull();
    expect(usablePhone('  ')).toBeNull();
    expect(usablePhone('010-')).toBeNull();
    expect(usablePhone(' 010-1234-5678 ')).toBe('010-1234-5678');
  });
});

describe('chartKey', () => {
  it('공백, 앞의 0, 재등록 접미사를 없앤다', () => {
    expect(chartKey(' 006366-1 ')).toBe('6366');
    expect(chartKey('006366')).toBe('6366');
    expect(chartKey(null)).toBe('');
  });
});

describe('matchPhone', () => {
  const history = [row('001234', '김하나', '010-1111-2222'), row('001235', '이둘', '010-3333-4444')];

  it('차트번호가 맞으면 이름이 달라도 그 번호를 쓴다', () => {
    expect(matchPhone({ patientName: '오타', chartNo: '001234' }, history)).toEqual({
      phone: '010-1111-2222',
      source: 'chart',
      ambiguous: false,
    });
  });

  it('앞의 0이 다른 차트번호도 같은 차트로 본다', () => {
    expect(matchPhone({ patientName: '김하나', chartNo: '1234' }, history).phone).toBe('010-1111-2222');
    expect(matchPhone({ patientName: '김하나', chartNo: '0001234' }, history).source).toBe('chart');
  });

  it('재등록 차트(-1)와 원래 차트를 같은 환자로 본다', () => {
    expect(matchPhone({ patientName: '김하나', chartNo: '001234-1' }, history).phone).toBe('010-1111-2222');
  });

  it('차트번호가 이력에 없으면 이름이 유일할 때 이름으로 찾는다', () => {
    expect(matchPhone({ patientName: '이둘', chartNo: '999999' }, history)).toEqual({
      phone: '010-3333-4444',
      source: 'name',
      ambiguous: false,
    });
  });

  it('차트번호가 없으면 이름이 유일할 때 그 번호를 쓴다', () => {
    expect(matchPhone({ patientName: '이둘' }, history)).toEqual({ phone: '010-3333-4444', source: 'name', ambiguous: false });
  });

  it('이름 앞뒤 공백은 무시한다', () => {
    expect(matchPhone({ patientName: '  이둘 ' }, [row('1', '이둘  ', '010-3333-4444')]).phone).toBe('010-3333-4444');
  });

  it('이름이 완전히 같지 않으면 찾지 않는다', () => {
    expect(matchPhone({ patientName: '이' }, history)).toEqual(NOTHING);
    expect(matchPhone({ patientName: '이둘이' }, history)).toEqual(NOTHING);
  });

  it('동명이인(번호가 서로 다름)은 고르지 않고 ambiguous 로 표시한다', () => {
    const homonyms = [row('1', '박민수', '010-1000-0001'), row('2', '박민수', '010-2000-0002')];
    expect(matchPhone({ patientName: '박민수' }, homonyms)).toEqual(AMBIG);
  });

  it('같은 사람이 차트를 두 개 가져 번호가 같으면 하나로 본다(표기 차이 포함)', () => {
    const same = [row('006366', '최영희', '010-5555-6666'), row('006366-1', '최영희', '01055556666')];
    expect(matchPhone({ patientName: '최영희' }, same)).toEqual({ phone: '010-5555-6666', source: 'name', ambiguous: false });
  });

  it('차트번호가 맞지만 번호가 비어 있으면 같은 이름의 다른 번호로 대신하지 않는다', () => {
    const h = [row('001', '정수', null), row('002', '정수', '010-9999-8888')];
    expect(matchPhone({ patientName: '정수', chartNo: '001' }, h)).toEqual(NOTHING);
  });

  it('비어 있거나 잘못된 번호는 무시한다', () => {
    const h = [row('1', '한별', ''), row('2', '한별', '010-'), row('3', '한별', null)];
    expect(matchPhone({ patientName: '한별' }, h)).toEqual(NOTHING);
    expect(matchPhone({ patientName: '한별' }, [...h, row('4', '한별', '010-7777-0000')]).phone).toBe('010-7777-0000');
  });

  it('내원 이력이 비었거나 이름이 "-" 이면 찾지 않는다', () => {
    expect(matchPhone({ patientName: '김하나' }, [])).toEqual(NOTHING);
    expect(matchPhone({ patientName: '-' }, [row('1', '-', '010-1111-2222')])).toEqual(NOTHING);
  });

  it('차트번호가 같은 행이 여럿이면 정확히 같은 표기를 우선하고, 없으면 애매함으로 본다', () => {
    const h = [row('006366', '최영희', '010-1111-1111'), row('006366-1', '최영희', '010-2222-2222')];
    expect(matchPhone({ patientName: '최영희', chartNo: '006366-1' }, h).phone).toBe('010-2222-2222');
    expect(matchPhone({ patientName: '최영희', chartNo: '6366' }, h)).toEqual(AMBIG);
  });
});
