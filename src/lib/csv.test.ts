import { describe, it, expect } from 'vitest';
import { buildCsv, csvCell, CSV_BOM } from './csv';

describe('csvCell', () => {
  it('null/undefined 는 빈 칸', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('쉼표·따옴표·줄바꿈이 든 칸은 따옴표로 감싸고 따옴표는 두 번 쓴다', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('말했다 "안녕"')).toBe('"말했다 ""안녕"""');
    expect(csvCell('첫줄\n둘째줄')).toBe('"첫줄\n둘째줄"');
    expect(csvCell('첫줄\r\n둘째줄')).toBe('"첫줄\r\n둘째줄"');
  });

  it('평범한 글자·한글은 그대로', () => {
    expect(csvCell('홍길동')).toBe('홍길동');
  });

  it('수식 주입: = + - @ 로 시작하는 글자 앞에 작은따옴표를 붙인다', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('\t=1')).toBe("'\t=1");
  });

  it('수식 글자에 쉼표가 있으면 작은따옴표를 붙인 뒤 따옴표로도 감싼다', () => {
    expect(csvCell('=A1,B1')).toBe('"\'=A1,B1"');
  });

  it('중간에 있는 = 는 건드리지 않는다', () => {
    expect(csvCell('a=b')).toBe('a=b');
  });

  it('숫자는 음수여도 그대로, 불리언은 true/false, 배열은 ; 로 잇는다', () => {
    expect(csvCell(-5000)).toBe('-5000');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(NaN)).toBe('');
    expect(csvCell(true)).toBe('true');
    expect(csvCell(['가', '나'])).toBe('가; 나');
  });
});

describe('buildCsv', () => {
  it('맨 앞에 BOM, 줄은 CRLF, 끝에 줄바꿈', () => {
    const csv = buildCsv(['이름', '금액'], [['홍길동', 1000]]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toBe('﻿이름,금액\r\n홍길동,1000\r\n');
  });

  it('행이 없어도 머리글은 나온다', () => {
    expect(buildCsv(['a', 'b'], [])).toBe('﻿a,b\r\n');
  });

  it('칸 안의 줄바꿈이 행을 깨지 않는다', () => {
    const csv = buildCsv(['메모'], [['가\n나'], [null]]);
    expect(csv).toBe('﻿메모\r\n"가\n나"\r\n\r\n');
  });
});
