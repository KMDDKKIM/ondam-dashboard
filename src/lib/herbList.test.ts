import { describe, it, expect } from 'vitest';
import {
  bagCount,
  countHerbs,
  filterHerbs,
  findDuplicateHerb,
  groupHerbsByInitial,
  partitionNewHerbs,
  sortHerbsKo,
  type HerbLike,
} from './herbList';

const h = (name: string, currentStock = 5, lowStockThreshold: number | null = null): HerbLike => ({
  name,
  currentStock,
  lowStockThreshold,
});

describe('sortHerbsKo', () => {
  it('가나다 순서로 정렬한다', () => {
    const names = sortHerbsKo([h('천궁'), h('당귀'), h('감초'), h('황기'), h('갈근'), h('나복자')]).map((x) => x.name);
    expect(names).toEqual(['갈근', '감초', '나복자', '당귀', '천궁', '황기']);
  });
  it('영문·숫자가 섞여도 한글 순서는 유지된다', () => {
    const names = sortHerbsKo([h('황기'), h('Ginseng'), h('가시오가피'), h('10번')]).map((x) => x.name);
    expect(names.indexOf('가시오가피')).toBeLessThan(names.indexOf('황기'));
  });
  it('원본을 바꾸지 않는다', () => {
    const input = [h('나'), h('가')];
    sortHerbsKo(input);
    expect(input.map((x) => x.name)).toEqual(['나', '가']);
  });
  it('같은 이름은 들어온 순서를 지킨다(안정 정렬)', () => {
    const a = { ...h('당귀'), id: 'a' };
    const b = { ...h('당귀'), id: 'b' };
    const c = { ...h('감초'), id: 'c' };
    expect(sortHerbsKo([a, b, c]).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('새 약재를 넣고 다시 정렬하면 제자리에 들어간다', () => {
    const sorted = sortHerbsKo([h('감초'), h('천궁')]);
    expect(sortHerbsKo([...sorted, h('당귀')]).map((x) => x.name)).toEqual(['감초', '당귀', '천궁']);
  });
});

describe('bagCount', () => {
  it('0 이상의 정수로 다듬는다', () => {
    expect(bagCount(3)).toBe(3);
    expect(bagCount(2.7)).toBe(2);
    expect(bagCount(-4)).toBe(0);
    expect(bagCount(NaN)).toBe(0);
  });
});

describe('countHerbs / filterHerbs', () => {
  const list = sortHerbsKo([h('당귀', 10, 3), h('감초', 2, 3), h('천궁', 0, 3), h('황기', 0), h('백출', 7)]);

  it('전체·부족·0봉지 개수', () => {
    // 부족: 감초(2<=3), 천궁(0<=3). 기준 없는 황기는 0봉지여도 부족이 아니다.
    expect(countHerbs(list)).toEqual({ all: 5, short: 2, empty: 2 });
  });
  it('빈 목록', () => {
    expect(countHerbs([])).toEqual({ all: 0, short: 0, empty: 0 });
  });
  it('필터', () => {
    expect(filterHerbs(list, '', 'all')).toHaveLength(5);
    expect(filterHerbs(list, '', 'short').map((x) => x.name)).toEqual(['감초', '천궁']);
    expect(filterHerbs(list, '', 'empty').map((x) => x.name)).toEqual(['천궁', '황기']);
  });
  it('검색어와 필터를 함께 쓰고 순서를 유지한다', () => {
    expect(filterHerbs(list, 'ㄱㅊ', 'all').map((x) => x.name)).toEqual(['감초']);
    expect(filterHerbs(list, 'ㅊ', 'empty').map((x) => x.name)).toEqual(['천궁']);
    expect(filterHerbs(list, '없는약재', 'all')).toEqual([]);
  });
});

describe('groupHerbsByInitial', () => {
  it('초성별로 묶고 순서를 지킨다', () => {
    const groups = groupHerbsByInitial(sortHerbsKo([h('당귀'), h('감초'), h('갈근'), h('천궁'), h('까치')]));
    expect(groups.map((g) => g.key)).toEqual(['ㄱ', 'ㄷ', 'ㅊ']);
    expect(groups[0].items.map((x) => x.name)).toEqual(['갈근', '감초', '까치']);
  });
  it('빈 목록', () => {
    expect(groupHerbsByInitial([])).toEqual([]);
  });
});

describe('findDuplicateHerb / partitionNewHerbs', () => {
  const existing = [h('당귀'), h('생지황'), h('Ginseng')];
  it('공백·대소문자를 무시하고 같은 이름을 찾는다', () => {
    expect(findDuplicateHerb(existing, '당 귀')?.name).toBe('당귀');
    expect(findDuplicateHerb(existing, 'ginseng')?.name).toBe('Ginseng');
    expect(findDuplicateHerb(existing, '천궁')).toBeUndefined();
    expect(findDuplicateHerb(existing, '   ')).toBeUndefined();
  });
  it('추가할 것 / 이미 있는 것 / 입력 안 중복으로 나눈다', () => {
    const entries = [{ name: '천궁' }, { name: '생 지황' }, { name: '천 궁' }, { name: '감초' }];
    const { toAdd, existing: dup, repeated } = partitionNewHerbs(existing, entries);
    expect(toAdd.map((e) => e.name)).toEqual(['천궁', '감초']);
    expect(dup.map((d) => [d.entry.name, d.herb.name])).toEqual([['생 지황', '생지황']]);
    expect(repeated).toEqual(['천 궁']);
  });
});
