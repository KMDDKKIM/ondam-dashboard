// 한글 초성 검색. "ㄷㄱ" → "당귀", "ㄷ귀"·"당ㄱ" 같이 일부만 초성인 입력도 찾는다.
// 한글 음절(U+AC00..U+D7A3)은 (초성 × 21 + 중성) × 28 + 종성 으로 이루어져 있어서 나눗셈만으로 초성을 뽑을 수 있다.

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const SYLLABLE_SPAN = 21 * 28; // 초성 하나가 차지하는 음절 수(588)

/** 자음 낱글자(ㄱ..ㅎ 중 초성으로 쓰이는 19개)인가. */
export function isChoseongJamo(ch: string): boolean {
  return CHOSEONG.includes(ch);
}

function isHangulSyllable(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return ch.length === 1 && code >= HANGUL_START && code <= HANGUL_END;
}

/** 글자 하나의 초성. 한글 음절이면 그 초성, 그 밖의 글자(자음 낱글자 포함)는 그대로 돌려준다. */
export function choseongOfChar(ch: string): string {
  if (!isHangulSyllable(ch)) return ch;
  return CHOSEONG[Math.floor((ch.charCodeAt(0) - HANGUL_START) / SYLLABLE_SPAN)];
}

/** 문자열의 초성만 뽑는다: "당귀" → "ㄷㄱ", "ㄷ귀" → "ㄷㄱ", "당귀 A" → "ㄷㄱ A". */
export function choseong(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFC')) out += choseongOfChar(ch);
  return out;
}

/** 검색용으로 다듬는다: 조합형(NFD) 입력을 합치고, 대소문자·공백을 없앤다. */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, '');
}

/**
 * 약재 이름이 검색어에 맞는가. 공백·대소문자를 무시한 부분 일치이고,
 * 검색어의 자음 낱글자(ㄷ, ㄱ …)는 이름의 같은 위치 글자의 초성과 맞으면 통과한다.
 * 빈 검색어는 모든 이름에 맞는다.
 */
export function matchesHerbName(name: string, query: string): boolean {
  const q = normalizeForSearch(query);
  if (q === '') return true;
  const n = normalizeForSearch(name);
  if (n.includes(q)) return true;
  const qChars = [...q];
  if (!qChars.some(isChoseongJamo)) return false;
  const nChars = [...n];
  for (let start = 0; start + qChars.length <= nChars.length; start++) {
    let ok = true;
    for (let j = 0; j < qChars.length; j++) {
      const qc = qChars[j];
      const nc = nChars[start + j];
      if (qc !== nc && !(isChoseongJamo(qc) && choseongOfChar(nc) === qc)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

// 된소리 초성은 예사소리 묶음에 넣는다(ㄲ→ㄱ). 목록의 묶음 머리글이 14개(+기타)로 유지된다.
const FOLD: Record<string, string> = { ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ' };

export const OTHER_GROUP = '#';

/** 이름의 첫 글자로 정한 묶음 글자: 'ㄱ' … 'ㅎ'. 한글로 시작하지 않으면 '#'. */
export function initialGroupKey(name: string): string {
  const first = [...name.normalize('NFC').trim()][0];
  if (!first) return OTHER_GROUP;
  const cho = choseongOfChar(first);
  if (!isChoseongJamo(cho)) return OTHER_GROUP;
  return FOLD[cho] ?? cho;
}
