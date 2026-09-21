import { describe, it, expect } from 'vitest';
import { choseong, initialGroupKey, matchesHerbName, normalizeForSearch } from './koreanSearch';

describe('choseong', () => {
  it('한글 음절의 초성만 뽑는다', () => {
    expect(choseong('당귀')).toBe('ㄷㄱ');
    expect(choseong('감초')).toBe('ㄱㅊ');
    expect(choseong('까치')).toBe('ㄲㅊ');
    expect(choseong('힣')).toBe('ㅎ'); // 마지막 음절(U+D7A3)
    expect(choseong('가')).toBe('ㄱ'); // 첫 음절(U+AC00)
  });
  it('자음 낱글자가 섞여 있어도 그대로 두고 나머지만 바꾼다', () => {
    expect(choseong('ㄷ귀')).toBe('ㄷㄱ');
    expect(choseong('당ㄱ')).toBe('ㄷㄱ');
    expect(choseong('ㄷㄱ')).toBe('ㄷㄱ');
  });
  it('한글이 아닌 글자·공백·모음 낱글자는 그대로', () => {
    expect(choseong('A 당귀 1')).toBe('A ㄷㄱ 1');
    expect(choseong('ㅏ')).toBe('ㅏ');
    expect(choseong('')).toBe('');
  });
});

describe('normalizeForSearch', () => {
  it('공백을 없애고 소문자로 만든다', () => {
    expect(normalizeForSearch('  당 귀 ')).toBe('당귀');
    expect(normalizeForSearch('ABC')).toBe('abc');
  });
  it('조합형(NFD) 한글을 완성형으로 합친다', () => {
    expect(normalizeForSearch('당귀'.normalize('NFD'))).toBe('당귀');
  });
});

describe('matchesHerbName', () => {
  it('일반 부분 일치', () => {
    expect(matchesHerbName('당귀', '당귀')).toBe(true);
    expect(matchesHerbName('당귀', '당')).toBe(true);
    expect(matchesHerbName('당귀', '귀')).toBe(true);
    expect(matchesHerbName('당귀', '천궁')).toBe(false);
  });
  it('초성만으로 찾는다', () => {
    expect(matchesHerbName('당귀', 'ㄷㄱ')).toBe(true);
    expect(matchesHerbName('당귀', 'ㄷ')).toBe(true);
    expect(matchesHerbName('당귀', 'ㄱ')).toBe(true); // 이름 중간 글자의 초성도 부분 일치
    expect(matchesHerbName('당귀', 'ㅊㄱ')).toBe(false);
  });
  it('일부만 초성인 입력', () => {
    expect(matchesHerbName('당귀', 'ㄷ귀')).toBe(true);
    expect(matchesHerbName('당귀', '당ㄱ')).toBe(true);
    expect(matchesHerbName('당귀', '단ㄱ')).toBe(false);
    expect(matchesHerbName('당귀', 'ㄷ궁')).toBe(false);
  });
  it('빈 검색어(공백만 포함)는 모두 통과', () => {
    expect(matchesHerbName('당귀', '')).toBe(true);
    expect(matchesHerbName('당귀', '   ')).toBe(true);
  });
  it('공백을 무시한다(검색어와 이름 양쪽)', () => {
    expect(matchesHerbName('당귀', '당 귀')).toBe(true);
    expect(matchesHerbName('생 지황', '생지')).toBe(true);
    expect(matchesHerbName('생지황', 'ㅅ ㅈ')).toBe(true);
  });
  it('대소문자를 무시한다', () => {
    expect(matchesHerbName('Ginseng', 'GIN')).toBe(true);
  });
  it('검색어가 이름보다 길면 안 맞는다', () => {
    expect(matchesHerbName('당귀', 'ㄷㄱㅊ')).toBe(false);
  });
});

describe('initialGroupKey', () => {
  it('첫 글자의 초성이 묶음이 된다', () => {
    expect(initialGroupKey('당귀')).toBe('ㄷ');
    expect(initialGroupKey('  천궁')).toBe('ㅊ');
  });
  it('된소리는 예사소리 묶음으로', () => {
    expect(initialGroupKey('까치')).toBe('ㄱ');
    expect(initialGroupKey('빠')).toBe('ㅂ');
  });
  it('한글이 아니면 #', () => {
    expect(initialGroupKey('Ginseng')).toBe('#');
    expect(initialGroupKey('1번')).toBe('#');
    expect(initialGroupKey('')).toBe('#');
  });
});
