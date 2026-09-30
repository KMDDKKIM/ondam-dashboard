import { describe, expect, it } from 'vitest';
import {
  canSaveOrder,
  computePackCount,
  herbLineTotal,
  incompleteHerbLines,
  mergeHerbLines,
  parseHerbGramsEntry,
  sortHerbLinesByGrams,
  totalHerbWeight,
} from './herbCompounding';

describe('herbLineTotal', () => {
  it('1첩당 그램 × 첩수', () => {
    expect(herbLineTotal({ gramsPerPacket: 6 }, 10)).toBe(60);
    expect(herbLineTotal({ gramsPerPacket: 7.5 }, 10)).toBe(75);
  });

  it('소수 첫째 자리까지 반올림한다', () => {
    expect(herbLineTotal({ gramsPerPacket: 3.33 }, 3)).toBe(10);
  });
});

describe('totalHerbWeight', () => {
  it('모든 줄의 총용량을 더한다', () => {
    const herbs = [
      { herbName: '당귀', gramsPerPacket: 6 },
      { herbName: '천궁', gramsPerPacket: 4 },
    ];
    expect(totalHerbWeight(herbs, 10)).toBe(100); // (6+4) × 10
  });

  it('약재가 없으면 0', () => {
    expect(totalHerbWeight([], 10)).toBe(0);
  });
});

describe('canSaveOrder', () => {
  const base = { patientName: '홍길동', packetCount: 10, herbs: [{ herbName: '당귀', gramsPerPacket: 6 }] };

  it('환자명·첩수·약재가 다 있으면 저장 가능', () => {
    expect(canSaveOrder(base)).toBe(true);
  });

  it('환자명이 없으면 저장 불가', () => {
    expect(canSaveOrder({ ...base, patientName: '  ' })).toBe(false);
  });

  it('첩수가 0 이하면 저장 불가', () => {
    expect(canSaveOrder({ ...base, packetCount: 0 })).toBe(false);
  });

  it('약재가 하나도 안 채워졌으면 저장 불가', () => {
    expect(canSaveOrder({ ...base, herbs: [{ herbName: '', gramsPerPacket: 0 }] })).toBe(false);
  });

  it('약재 여러 줄 중 하나만 채워져 있어도 저장 가능(나머지는 빈 줄)', () => {
    expect(canSaveOrder({ ...base, herbs: [{ herbName: '', gramsPerPacket: 0 }, ...base.herbs] })).toBe(true);
  });
});

describe('incompleteHerbLines', () => {
  it('이름만 있고 그램이 없거나, 그램만 있고 이름이 없는 줄을 알려준다(1부터)', () => {
    const herbs = [
      { herbName: '당귀', gramsPerPacket: 6 }, // 완성
      { herbName: '천궁', gramsPerPacket: 0 }, // 이름만
      { herbName: '', gramsPerPacket: 4 }, // 그램만
      { herbName: '', gramsPerPacket: 0 }, // 완전히 빈 줄 — 문제 아님
    ];
    expect(incompleteHerbLines(herbs)).toEqual([2, 3]);
  });

  it('문제 없으면 빈 배열', () => {
    expect(incompleteHerbLines([{ herbName: '당귀', gramsPerPacket: 6 }])).toEqual([]);
  });
});

describe('parseHerbGramsEntry', () => {
  it('숫자 앞에 나온 이름들 전부에 그 숫자를 그램으로 적용한다', () => {
    const result = parseHerbGramsEntry('당귀 천궁 백출 4 산사 신곡 맥아 2');
    expect(result.herbs).toEqual([
      { herbName: '당귀', prepMethod: '', gramsPerPacket: 4 },
      { herbName: '천궁', prepMethod: '', gramsPerPacket: 4 },
      { herbName: '백출', prepMethod: '', gramsPerPacket: 4 },
      { herbName: '산사', prepMethod: '', gramsPerPacket: 2 },
      { herbName: '신곡', prepMethod: '', gramsPerPacket: 2 },
      { herbName: '맥아', prepMethod: '', gramsPerPacket: 2 },
    ]);
    expect(result.danglingNames).toEqual([]);
  });

  it('줄바꿈·쉼표도 공백처럼 다룬다', () => {
    const result = parseHerbGramsEntry('당귀 6\n천궁, 생강 3');
    expect(result.herbs).toEqual([
      { herbName: '당귀', prepMethod: '', gramsPerPacket: 6 },
      { herbName: '천궁', prepMethod: '', gramsPerPacket: 3 },
      { herbName: '생강', prepMethod: '', gramsPerPacket: 3 },
    ]);
  });

  it('소수 그램도 받는다', () => {
    expect(parseHerbGramsEntry('당귀 7.5').herbs).toEqual([{ herbName: '당귀', prepMethod: '', gramsPerPacket: 7.5 }]);
  });

  it('같은 이름이 여러 번 나오면 그램을 더한다', () => {
    expect(parseHerbGramsEntry('당귀 4 당귀 2').herbs).toEqual([{ herbName: '당귀', prepMethod: '', gramsPerPacket: 6 }]);
  });

  it('끝까지 숫자가 안 붙은 이름은 반영하지 않고 danglingNames로 돌려준다', () => {
    const result = parseHerbGramsEntry('당귀 4 천궁 생강');
    expect(result.herbs).toEqual([{ herbName: '당귀', prepMethod: '', gramsPerPacket: 4 }]);
    expect(result.danglingNames).toEqual(['천궁', '생강']);
  });

  it('맨 앞에 이름 없이 숫자만 나오면 버린다', () => {
    expect(parseHerbGramsEntry('4 당귀 6').herbs).toEqual([{ herbName: '당귀', prepMethod: '', gramsPerPacket: 6 }]);
  });

  it('빈 입력은 빈 결과', () => {
    expect(parseHerbGramsEntry('   ')).toEqual({ herbs: [], danglingNames: [] });
  });
});

describe('computePackCount', () => {
  it('하루 복용횟수 × 며칠분', () => {
    expect(computePackCount(3, 10)).toBe(30);
  });

  it('하루 복용횟수가 0이면 0', () => {
    expect(computePackCount(0, 10)).toBe(0);
  });

  it('며칠분이 0이면 0', () => {
    expect(computePackCount(3, 0)).toBe(0);
  });
});

describe('sortHerbLinesByGrams', () => {
  const herbs = [
    { herbName: '당귀', gramsPerPacket: 6 },
    { herbName: '천궁', gramsPerPacket: 2 },
    { herbName: '백출', gramsPerPacket: 4 },
  ];

  it('오름차순 정렬', () => {
    expect(sortHerbLinesByGrams(herbs, 'asc').map((h) => h.herbName)).toEqual(['천궁', '백출', '당귀']);
  });

  it('내림차순 정렬', () => {
    expect(sortHerbLinesByGrams(herbs, 'desc').map((h) => h.herbName)).toEqual(['당귀', '백출', '천궁']);
  });

  it('그램이 같으면 원래 순서를 유지한다', () => {
    const tied = [
      { herbName: 'A', gramsPerPacket: 4 },
      { herbName: 'B', gramsPerPacket: 4 },
    ];
    expect(sortHerbLinesByGrams(tied, 'asc').map((h) => h.herbName)).toEqual(['A', 'B']);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const original = [...herbs];
    sortHerbLinesByGrams(herbs, 'asc');
    expect(herbs).toEqual(original);
  });
});

describe('mergeHerbLines', () => {
  it('기존 줄 뒤에 새로 읽은 약재를 더한다', () => {
    const existing = [{ herbName: '당귀', prepMethod: '', gramsPerPacket: 6 }];
    const parsed = [{ herbName: '천궁', prepMethod: '', gramsPerPacket: 4 }];
    expect(mergeHerbLines(existing, parsed)).toEqual([
      { herbName: '당귀', prepMethod: '', gramsPerPacket: 6 },
      { herbName: '천궁', prepMethod: '', gramsPerPacket: 4 },
    ]);
  });

  it('완전히 빈 줄(새 처방전의 기본 빈 줄)은 버린다', () => {
    const existing = [{ herbName: '', prepMethod: '', gramsPerPacket: 0 }];
    const parsed = [{ herbName: '당귀', prepMethod: '', gramsPerPacket: 6 }];
    expect(mergeHerbLines(existing, parsed)).toEqual([{ herbName: '당귀', prepMethod: '', gramsPerPacket: 6 }]);
  });

  it('이름이 같으면 그램을 더하고, 이미 손으로 채운 값(수치 포함)을 지우지 않는다', () => {
    const existing = [{ herbName: '당귀', prepMethod: '주초', gramsPerPacket: 6 }];
    const parsed = [{ herbName: '당귀', prepMethod: '', gramsPerPacket: 4 }];
    expect(mergeHerbLines(existing, parsed)).toEqual([{ herbName: '당귀', prepMethod: '주초', gramsPerPacket: 10 }]);
  });
});
