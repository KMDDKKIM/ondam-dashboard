import { describe, expect, it } from 'vitest';
import { herbsForFormula, parseFormulaHerbs, parseFormulaImport, parseFormulaJson, splitFormulaName, splitHerbNameList, summarizeFormulaHerbs } from './herbFormulas';

// 처방·약재 이름은 시험용 값이다(공개 저장소).
describe('parseFormulaHerbs', () => {
  it('이름 여러 개 뒤의 그램을 그 앞 이름들에 한꺼번에 적용한다(g 글자 포함)', () => {
    expect(parseFormulaHerbs('가 12g 나 12g 다 8g 라 마 바 4g').herbs).toEqual([
      { herbName: '가', prepMethod: '', gramsPerPacket: 12 },
      { herbName: '나', prepMethod: '', gramsPerPacket: 12 },
      { herbName: '다', prepMethod: '', gramsPerPacket: 8 },
      { herbName: '라', prepMethod: '', gramsPerPacket: 4 },
      { herbName: '마', prepMethod: '', gramsPerPacket: 4 },
      { herbName: '바', prepMethod: '', gramsPerPacket: 4 },
    ]);
  });

  it('이름 뒤 "-"는 수치(포제)', () => {
    expect(parseFormulaHerbs('가-炒 12g 나-초(炒) 4g').herbs).toEqual([
      { herbName: '가', prepMethod: '炒', gramsPerPacket: 12 },
      { herbName: '나', prepMethod: '초(炒)', gramsPerPacket: 4 },
    ]);
  });

  it('소수 그램과 쉼표 구분을 받는다', () => {
    expect(parseFormulaHerbs('가,나 7.5g').herbs.map((h) => h.gramsPerPacket)).toEqual([7.5, 7.5]);
  });

  it('같은 이름이 또 나와도 합치지 않는다', () => {
    expect(parseFormulaHerbs('가 4g 가 2g').herbs).toHaveLength(2);
  });

  it('끝까지 그램이 안 붙은 이름은 danglingNames', () => {
    expect(parseFormulaHerbs('가 4g 나 다').danglingNames).toEqual(['나', '다']);
  });

  it('맨 앞의 숫자만 있는 토큰은 버린다', () => {
    expect(parseFormulaHerbs('4g 가 6g').herbs).toEqual([{ herbName: '가', prepMethod: '', gramsPerPacket: 6 }]);
  });
});

describe('splitFormulaName', () => {
  it('한글명(한자명)을 나눈다', () => {
    expect(splitFormulaName('가감시험탕(加減試驗湯)')).toEqual({ name: '가감시험탕', nameHanja: '加減試驗湯' });
  });

  it('한자명이 비어 있거나 괄호가 없어도 된다', () => {
    expect(splitFormulaName('가감시험탕()')).toEqual({ name: '가감시험탕', nameHanja: '' });
    expect(splitFormulaName(' 시험탕 ')).toEqual({ name: '시험탕', nameHanja: '' });
  });
});

describe('parseFormulaImport', () => {
  it('탭으로 나눈 OK차트 표(처방명·출전·약재·약재메모·주치·탕전)를 읽는다', () => {
    const text = '가감시험탕(加減試驗湯)\t사상의학\t가 12g 나 8g\t\t태음인\t탕전';
    const { rows, skipped } = parseFormulaImport(text);
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: '가감시험탕', nameHanja: '加減試驗湯', source: '사상의학' });
    expect(rows[0].herbs).toHaveLength(2);
  });

  it('" | "로 나눈 처방명 | 약재 구성(출전 없음)도 읽고, 기본 출전을 붙인다', () => {
    const { rows } = parseFormulaImport('시험탕 | 가 6g 나 4g', '채움생');
    expect(rows[0]).toMatchObject({ name: '시험탕', source: '채움생' });
  });

  it('칸이 하나뿐이거나 약재(그램)가 없는 줄은 건너뛰고 줄 번호를 알려 준다', () => {
    const { rows, skipped } = parseFormulaImport('시험탕\n시험탕 | 약재없음\n정상탕 | 가 4g');
    expect(rows.map((r) => r.name)).toEqual(['정상탕']);
    expect(skipped.map((s) => s.line)).toEqual([1, 2]);
  });

  it('같은 처방명+출전이 두 번 나오면 뒤엣것으로 덮어쓴다', () => {
    const { rows } = parseFormulaImport('시험탕 | 가 4g\n시험탕 | 가 6g');
    expect(rows).toHaveLength(1);
    expect(rows[0].herbs[0].gramsPerPacket).toBe(6);
  });

  it('빈 줄과 Windows 줄바꿈을 받는다', () => {
    expect(parseFormulaImport('\r\n시험탕 | 가 4g\r\n\r\n').rows).toHaveLength(1);
  });
});

describe('summarizeFormulaHerbs · herbsForFormula', () => {
  it('요약은 앞 몇 개만 보여 주고 전체 종수를 알려 준다', () => {
    const herbs = Array.from({ length: 10 }, (_, i) => ({ herbName: `약${i}`, prepMethod: '', gramsPerPacket: 4 }));
    expect(summarizeFormulaHerbs(herbs, 2)).toBe('약0 4g · 약1 4g …(10종)');
  });

  it('저장할 때는 이름이나 그램이 빈 줄을 뺀다', () => {
    expect(
      herbsForFormula([
        { herbName: ' 가 ', prepMethod: ' 炒 ', gramsPerPacket: 4 },
        { herbName: '', prepMethod: '', gramsPerPacket: 0 },
        { herbName: '나', prepMethod: '', gramsPerPacket: 0 },
      ])
    ).toEqual([{ herbName: '가', prepMethod: '炒', gramsPerPacket: 4 }]);
  });
});

describe('parseFormulaJson', () => {
  const one = (o: object) => JSON.stringify([o]);

  it('배열의 처방을 읽는다(약재 name·prep·grams)', () => {
    const { rows, skipped, error } = parseFormulaJson(
      one({ name: '시험탕', nameHanja: '試驗湯', source: '시험서', indication: '시험 주치', memo: '가감법', herbs: [{ name: '가', prep: '炒', grams: 6 }, { name: '나', grams: '4g' }] })
    );
    expect(error).toBeUndefined();
    expect(skipped).toEqual([]);
    expect(rows[0]).toMatchObject({ name: '시험탕', nameHanja: '試驗湯', source: '시험서', indication: '시험 주치', memo: '가감법' });
    expect(rows[0].herbs).toEqual([
      { herbName: '가', prepMethod: '炒', gramsPerPacket: 6 },
      { herbName: '나', prepMethod: '', gramsPerPacket: 4 },
    ]);
  });

  it('약재의 한자 이름(hanja)을 함께 보관한다', () => {
    const { rows } = parseFormulaJson(one({ name: '시험탕', herbs: [{ name: '당귀', hanja: '當歸', grams: 6 }, { name: '가', grams: 1 }] }));
    expect(rows[0].herbs[0]).toEqual({ herbName: '당귀', prepMethod: '', gramsPerPacket: 6, hanja: '當歸' });
    expect(rows[0].herbs[1]).not.toHaveProperty('hanja');
  });

  it('{ formulas: [...] } 모양과 한글 키도 받는다', () => {
    const { rows } = parseFormulaJson(JSON.stringify({ formulas: [{ 처방명: '시험탕(試驗湯)', 출전: '시험서', 주치: '주치', 약재: [{ 약재명: '가', 용량: 3 }] }] }));
    expect(rows[0]).toMatchObject({ name: '시험탕', nameHanja: '試驗湯', source: '시험서', indication: '주치' });
  });

  it('그램을 모르는 약재(null)는 0으로 들어간다', () => {
    const { rows } = parseFormulaJson(one({ name: '시험탕', herbs: [{ name: '가', grams: null }] }));
    expect(rows[0].herbs[0].gramsPerPacket).toBe(0);
  });

  it('출전이 없으면 기본 출전을 붙인다', () => {
    expect(parseFormulaJson(one({ name: '시험탕', herbs: [{ name: '가', grams: 1 }] }), '채움생').rows[0].source).toBe('채움생');
  });

  it('처방명·약재가 없는 항목은 건너뛰고 번호를 알려 준다', () => {
    const { rows, skipped } = parseFormulaJson(JSON.stringify([{ herbs: [{ name: '가', grams: 1 }] }, { name: '시험탕' }, { name: '정상탕', herbs: [{ name: '가', grams: 1 }] }]));
    expect(rows.map((r) => r.name)).toEqual(['정상탕']);
    expect(skipped.map((s) => s.line)).toEqual([1, 2]);
  });

  it('같은 처방명+출전은 뒤엣것으로 덮어쓰고, 출전이 다르면 따로 둔다', () => {
    const { rows } = parseFormulaJson(
      JSON.stringify([
        { name: '보중익기탕', source: 'A서', herbs: [{ name: '가', grams: 1 }] },
        { name: '보중익기탕', source: 'B서', herbs: [{ name: '가', grams: 2 }] },
        { name: '보중익기탕', source: 'A서', herbs: [{ name: '가', grams: 3 }] },
      ])
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.source === 'A서')?.herbs[0].gramsPerPacket).toBe(3);
  });

  it('JSON이 아니거나 배열이 아니면 error', () => {
    expect(parseFormulaJson('{ 깨짐').error).toBeTruthy();
    expect(parseFormulaJson('{"a":1}').error).toBeTruthy();
  });
});

describe('splitHerbNameList', () => {
  it('공백·쉼표·가운뎃점으로 나누고 중복을 뺀다', () => {
    expect(splitHerbNameList('당귀 천궁,백출·당귀')).toEqual(['당귀', '천궁', '백출']);
    expect(splitHerbNameList('  ')).toEqual([]);
  });
});
