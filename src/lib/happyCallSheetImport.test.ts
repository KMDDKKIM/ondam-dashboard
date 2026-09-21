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
