import { describe, expect, it } from 'vitest';
import { classifyRows, normalizeDoctorName, parseSheetDate, parseSheetPaste, parseTsv } from './happyCallSheetImport';

const TODAY = '2026-09-21';

describe('parseSheetDate', () => {
  it('시트에서 흔한 날짜 모양을 YYYY-MM-DD 로 바꾼다', () => {
    expect(parseSheetDate('2026-09-14', 2026)).toBe('2026-09-14');
    expect(parseSheetDate('2026. 9. 14', 2026)).toBe('2026-09-14');
    expect(parseSheetDate('2026. 9. 14.', 2026)).toBe('2026-09-14');
    expect(parseSheetDate('26.09.14', 2026)).toBe('2026-09-14');
    expect(parseSheetDate('2026/9/4', 2026)).toBe('2026-09-04');
    expect(parseSheetDate('9/14', 2026)).toBe('2026-09-14');
    expect(parseSheetDate('9월 14일', 2026)).toBe('2026-09-14');
  });

  it('연도가 없고 기준일보다 앞서면 해를 넘긴 것으로 본다', () => {
    expect(parseSheetDate('1/3', 2025, '2025-12-20')).toBe('2026-01-03');
    expect(parseSheetDate('12/28', 2025, '2025-12-20')).toBe('2025-12-28');
  });

  it('없는 날짜·이상한 글자는 null', () => {
    expect(parseSheetDate('', 2026)).toBeNull();
    expect(parseSheetDate('2026-02-31', 2026)).toBeNull();
    expect(parseSheetDate('내일', 2026)).toBeNull();
  });
});

describe('parseTsv', () => {
  it('따옴표로 감싼 칸의 줄바꿈과 따옴표를 처리한다', () => {
    const rows = parseTsv('가\t"나\n다"\t"라""마"\n1\t2\t3');
    expect(rows).toEqual([
      ['가', '나\n다', '라"마'],
      ['1', '2', '3'],
    ]);
  });

  it('빈 줄은 버린다', () => {
    expect(parseTsv('a\tb\n\n\t\nc\td\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('normalizeDoctorName', () => {
  it('호칭을 뗀다', () => {
    expect(normalizeDoctorName('김동규 원장')).toBe('김동규');
    expect(normalizeDoctorName('김동규님')).toBe('김동규');
    expect(normalizeDoctorName(' 박소은 ')).toBe('박소은');
  });
});

describe('parseSheetPaste', () => {
  it('머리글이 있으면 열 순서가 달라도 이름으로 칸을 찾는다', () => {
    const text = ['구분\t성함\t초진일\t진료의\t재내원1\t메모', '건보\t홍길동\t2026. 9. 14\t김동규\t9/21\t재내원 완료'].join('\n');
    const { rows, headerFound } = parseSheetPaste(text, TODAY);
    expect(headerFound).toBe(true);
    expect(rows[0]).toMatchObject({
      patientName: '홍길동',
      doctorName: '김동규',
      patientType: '건보',
      firstVisitDate: '2026-09-14',
      revisit1: '2026-09-21',
      memo: '재내원 완료',
      errors: [],
    });
  });

  it('머리글이 없으면 이 화면 표의 순서로 본다', () => {
    const text = '홍길동\t김동규\t자보\t성공\t다음주\t통화 완료\t2026-09-14\t9/21\t\t\t9/28\t\t\t메모';
    const { rows, headerFound } = parseSheetPaste(text, TODAY);
    expect(headerFound).toBe(false);
    expect(rows[0]).toMatchObject({
      patientName: '홍길동',
      patientType: '자보',
      acupuncture: '성공',
      nextVisitNote: '다음주',
      callLog: '통화 완료',
      revisit1: '2026-09-21',
      jaboHerb1: '2026-09-28',
      memo: '메모',
      errors: [],
    });
  });

  it('알 수 없는 머리글은 무시하고 알려 준다', () => {
    const { ignoredHeaders } = parseSheetPaste('성함\t진료의\t구분\t초진일\t성별\n홍길동\t김동규\t건보\t9/14\t남', TODAY);
    expect(ignoredHeaders).toEqual(['성별']);
  });

  it('필수 항목이 비었거나 값을 못 읽으면 오류로 알려 준다', () => {
    const text = ['성함\t진료의\t구분\t초진일', '\t김동규\t건보\t9/14', '홍길동\t\t보험\t어제'].join('\n');
    const { rows } = parseSheetPaste(text, TODAY);
    expect(rows[0].errors).toEqual(['성함이 비어 있어요']);
    expect(rows[1].errors).toHaveLength(3);
    expect(rows[1].errors[0]).toContain('진료의');
    expect(rows[1].errors[1]).toContain('구분');
    expect(rows[1].errors[2]).toContain('초진일');
  });

  it('재초진 표시를 읽고, 연말에서 연초로 넘어가는 재내원 날짜를 이어 준다', () => {
    const text = ['성함\t진료의\t구분\t초진/재초진\t초진일\t재내원1', '홍길동\t김동규\t건보\t재초진\t2025. 12. 26\t1/6'].join('\n');
    const { rows } = parseSheetPaste(text, TODAY);
    expect(rows[0].visitKind).toBe('재초진');
    expect(rows[0].revisit1).toBe('2026-01-06');
  });
});

// 실제 구글시트에서 복사한 것과 같은 모양(머리글 없음, 맨 앞 빈 열, 사이사이 빈 칸, 맨 뒤 계산 칸)을 가상 데이터로 만든다.
function sheetLine(o: {
  name: string; doctor: string; type: string; acu?: string; memo?: string; call?: string;
  first: string; r1?: string; r2?: string; r3?: string;
}): string {
  const cells = ['', o.name, o.doctor, o.type, '', o.acu ?? '', o.memo ?? '', '', '', '', '', '', o.call ?? '', '', '', '', '', '',
    o.first, o.r1 ?? '', o.r2 ?? '', o.r3 ?? '', '', '', '', '',
    '202634', o.doctor, o.type, '2', '2', '0', '0', 'N', '1', '1', '202609'];
  return cells.join('\t');
}

describe('parseSheetPaste - 실제 시트 모양(머리글 없음)', () => {
  it('맨 앞 빈 열과 사이 빈 칸을 건너뛰고 열 위치로 읽고, 뒤쪽 계산 칸은 무시한다', () => {
    const text = sheetLine({
      name: '홍길동', doctor: '박소은', type: '자보', acu: '비포함', memo: '목어깨 허리 / TA',
      call: '컨디션 괜찮으셨다고 하세요', first: '2026. 8. 20', r1: '2026. 8. 21', r2: '2026. 8. 24',
    });
    const { rows, headerFound } = parseSheetPaste(text, TODAY);
    expect(headerFound).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      patientName: '홍길동',
      doctorName: '박소은',
      patientType: '자보',
      acupuncture: '비포함',
      nextVisitNote: '목어깨 허리 / TA',
      callLog: '컨디션 괜찮으셨다고 하세요',
      firstVisitDate: '2026-08-20',
      revisit1: '2026-08-21',
      revisit2: '2026-08-24',
      errors: [],
    });
  });

  it('맨 앞 빈 열이 없어도(성함부터 복사) 같은 위치 관계로 읽는다', () => {
    const text = sheetLine({ name: '성춘향', doctor: '김동규', type: '건보', first: '2026. 9. 3', r1: '2026. 9. 4' }).replace(/^\t/, '');
    const { rows } = parseSheetPaste(text, TODAY);
    expect(rows[0]).toMatchObject({ patientName: '성춘향', doctorName: '김동규', patientType: '건보', firstVisitDate: '2026-09-03', revisit1: '2026-09-04', errors: [] });
  });

  it('통화내역 "8/22 부재" 같은 글은 그대로 두고, 초진일만 있는 줄도 읽는다', () => {
    const text = sheetLine({ name: '이몽룡', doctor: '김동규', type: '건보', acu: '실패', call: '8/22 부재', first: '2026. 8. 21' });
    expect(parseSheetPaste(text, TODAY).rows[0]).toMatchObject({ callLog: '8/22 부재', acupuncture: '실패', revisit1: null, errors: [] });
  });

  it('구분이 "기타"면 오류가 아니라 고르도록 표시한다', () => {
    const text = sheetLine({ name: '심청', doctor: '박소은', type: '기타', first: '2026. 9. 9' });
    const row = parseSheetPaste(text, TODAY).rows[0];
    expect(row.isOtherType).toBe(true);
    expect(row.patientType).toBeNull();
    expect(row.errors).toEqual([]);
  });

  it('초진일과 같거나 빠른 재내원 날짜는 등록하지 않고 알려 준다', () => {
    const text = sheetLine({ name: '흥부', doctor: '김동규', type: '건보', first: '2026. 8. 21', r3: '2026. 8. 21' });
    const row = parseSheetPaste(text, TODAY).rows[0];
    expect(row.revisit3).toBeNull();
    expect(row.notes[0]).toContain('재내원3');
    expect(row.errors).toEqual([]);
  });

  it('셀 안 줄바꿈으로 줄이 쪼개져도(따옴표 없이) 원래 한 줄로 이어 붙인다', () => {
    const whole = sheetLine({ name: '놀부', doctor: '김동규', type: '건보', acu: '비포함', memo: '복부랑 팔다리', call: '9/12 부재', first: '2026. 9. 11' });
    const cells = whole.split('\t');
    const memoIdx = cells.indexOf('복부랑 팔다리');
    // 메모 칸 끝에서 줄바꿈 → 다음 줄은 (남은 빈 조각 + 뒤의 칸들)
    const line1 = cells.slice(0, memoIdx + 1).join('\t');
    const line2 = ['', ...cells.slice(memoIdx + 1)].join('\t');
    const { rows } = parseSheetPaste(`${line1}\n${line2}`, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ patientName: '놀부', callLog: '9/12 부재', firstVisitDate: '2026-09-11', errors: [] });
  });

  it('여러 줄을 붙여넣으면 줄마다 읽고, 새 환자 줄을 이어 붙이지 않는다', () => {
    const text = [
      sheetLine({ name: '가나다', doctor: '김동규', type: '건보', first: '2026. 9. 1' }),
      sheetLine({ name: '라마바', doctor: '박소은', type: '비급여', first: '2026. 9. 2' }),
    ].join('\n');
    const { rows } = parseSheetPaste(text, TODAY);
    expect(rows.map((r) => r.patientName)).toEqual(['가나다', '라마바']);
    expect(rows.map((r) => r.doctorName)).toEqual(['김동규', '박소은']);
  });
});

describe('classifyRows', () => {
  it('오류·이미 등록됨·붙여넣기 안 중복·등록 가능을 나눈다', () => {
    const text = [
      '성함\t진료의\t구분\t초진일',
      '홍길동\t김동규\t건보\t2026-09-14',
      '성춘향\t김동규\t건보\t2026-09-14',
      '성춘향\t김동규\t건보\t2026-09-14',
      '\t김동규\t건보\t2026-09-14',
    ].join('\n');
    const { rows } = parseSheetPaste(text, TODAY);
    const status = classifyRows(rows, [{ patientName: '홍길동', firstVisitDate: '2026-09-14' }]);
    expect(status).toEqual(['exists', 'ready', 'duplicate-in-paste', 'error']);
  });
});
