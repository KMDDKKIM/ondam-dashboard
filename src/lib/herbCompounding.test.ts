import { describe, expect, it } from 'vitest';
import { canSaveOrder, herbLineTotal, incompleteHerbLines, totalHerbWeight } from './herbCompounding';

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
