// 처방집(처방명 → 약재 구성)의 순수 로직. OK차트(OKOMS)의 처방집 화면처럼 처방명을 검색해 약재 목록을 채우기 위한 것이다.
// 화면/DB 코드는 따로 있다.
//
// 약재 구성 표기는 OK차트 처방집 그대로다 — 이름 여러 개 뒤에 그램을 한 번 적으면 그 앞의 이름들에 한꺼번에 적용된다:
//   "의이인 12g 부평초 12g 갈근 8g 곤포 길경 황금 8g 맥문동 나복자 4g"
// 약재 이름 뒤에 "-"로 수치(포제)를 붙일 수 있다: "백작약-炒 12g", "창이자-초(炒) 4g".

import type { HerbLine } from './herbCompounding';

export interface HerbFormula {
  id: string;
  /** 처방명(한글) — 예: 가감갈근부평탕 */
  name: string;
  /** 한자명 — 예: 加減葛根浮萍湯 (없으면 빈 문자열) */
  nameHanja: string;
  /** 출전/출처(예: 사상의학, 채움생) — 없으면 빈 문자열. 같은 처방명이라도 출전이 다르면 따로 둔다. */
  source: string;
  /** 주치/효능 */
  indication: string;
  herbs: HerbLine[];
  memo: string;
}

const GRAMS_TOKEN = /^[0-9]+(\.[0-9]+)?g?$/i;

function toGrams(token: string): number {
  return Number(token.replace(/g$/i, ''));
}

export interface ParsedFormulaHerbs {
  herbs: HerbLine[];
  /** 끝까지 그램이 안 붙어 반영되지 않은 이름들. */
  danglingNames: string[];
}

/** "의이인 12g 부평초 12g 갈근 8g 곤포 길경 황금 8g" → 약재 줄들. 같은 이름이 또 나와도 합치지 않고 줄을 따로 둔다. */
export function parseFormulaHerbs(text: string): ParsedFormulaHerbs {
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const herbs: HerbLine[] = [];
  let pending: string[] = [];

  function flush(grams: number) {
    for (const raw of pending) {
      // "백작약-炒" → 이름 백작약, 수치 炒. 이름 맨 앞이 "-"인 이상한 토큰은 그대로 이름으로 둔다.
      const dash = raw.search(/[-－]/);
      const herbName = dash > 0 ? raw.slice(0, dash) : raw;
      const prepMethod = dash > 0 ? raw.slice(dash + 1) : '';
      herbs.push({ herbName, prepMethod, gramsPerPacket: grams });
    }
    pending = [];
  }

  for (const token of tokens) {
    if (GRAMS_TOKEN.test(token)) {
      if (pending.length > 0) flush(toGrams(token));
    } else {
      pending.push(token);
    }
  }
  return { herbs, danglingNames: pending };
}

/** "가감갈근부평탕(加減葛根浮萍湯)" → 한글명과 한자명. 괄호가 없으면 한자명은 빈 문자열. */
export function splitFormulaName(raw: string): { name: string; nameHanja: string } {
  const text = raw.trim();
  const m = text.match(/^(.*?)\s*[(（]([^()（）]*)[)）]\s*$/);
  if (!m) return { name: text, nameHanja: '' };
  return { name: m[1].trim(), nameHanja: m[2].trim() };
}

/** 처방집에 처방 하나를 가져올 때 한 줄의 결과. */
export interface FormulaImportRow {
  name: string;
  nameHanja: string;
  source: string;
  indication: string;
  memo: string;
  herbs: HerbLine[];
  /** 그램이 안 붙어 반영 못 한 약재 이름(있으면 확인이 필요하다) */
  danglingNames: string[];
}

export interface FormulaImportResult {
  rows: FormulaImportRow[];
  /** 읽지 못한 줄 — 줄 번호(1부터)와 이유 */
  skipped: { line: number; reason: string }[];
}

function splitFields(line: string): string[] {
  const fields = line.includes('\t') ? line.split('\t') : line.split(/\s*\|\s*/);
  return fields.map((f) => f.trim());
}

function gramsTokenCount(text: string): number {
  return text.split(/[\s,]+/).filter((t) => GRAMS_TOKEN.test(t)).length;
}

/**
 * 붙여넣은 처방집 글을 처방 목록으로 바꾼다. 한 줄에 한 처방, 칸은 탭이나 " | "로 나눈다:
 *   처방명 | 출전(선택) | 약재 구성 [| 그 밖의 칸은 무시]
 * OK차트 처방집 표를 복사해 붙이면 (처방명, 출전, 약재, 약재메모, 주치, 탕전) 순서의 탭 칸이 그대로 들어온다.
 * 약재 구성 칸은 그램 숫자가 가장 많이 든 칸으로 찾는다. 같은 이름+출전이 두 번 나오면 뒤엣것을 쓴다.
 */
export function parseFormulaImport(text: string, defaultSource = ''): FormulaImportResult {
  const rows: FormulaImportRow[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const byKey = new Map<string, number>();

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const lineNo = index + 1;
    const fields = splitFields(rawLine).filter((f, i, all) => !(f === '' && i === all.length - 1));
    if (fields.length < 2) {
      skipped.push({ line: lineNo, reason: '칸이 하나뿐이에요(처방명과 약재 구성을 탭이나 | 로 나눠 주세요)' });
      return;
    }
    // 약재 구성 칸: 그램 숫자가 가장 많은 칸(처방명 칸은 제외).
    let herbsIndex = -1;
    let best = 0;
    for (let i = 1; i < fields.length; i++) {
      const n = gramsTokenCount(fields[i]);
      if (n > best) {
        best = n;
        herbsIndex = i;
      }
    }
    if (herbsIndex < 0) {
      skipped.push({ line: lineNo, reason: '약재 구성(그램)을 찾지 못했어요' });
      return;
    }
    const { name, nameHanja } = splitFormulaName(fields[0]);
    if (!name) {
      skipped.push({ line: lineNo, reason: '처방명이 비어 있어요' });
      return;
    }
    const parsed = parseFormulaHerbs(fields[herbsIndex]);
    if (parsed.herbs.length === 0) {
      skipped.push({ line: lineNo, reason: '약재를 읽지 못했어요' });
      return;
    }
    // 출전: 약재 칸 앞에 칸이 더 있으면 그 칸(보통 두 번째), 없으면 기본 출전.
    const source = herbsIndex >= 2 ? fields[1] : defaultSource.trim();
    const row: FormulaImportRow = { name, nameHanja, source, indication: '', memo: '', herbs: parsed.herbs, danglingNames: parsed.danglingNames };
    const key = `${name}\u0000${source}`;
    const existing = byKey.get(key);
    if (existing != null) rows[existing] = row;
    else {
      byKey.set(key, rows.length);
      rows.push(row);
    }
  });
  return { rows, skipped };
}

/** 검색 결과에 보여줄 약재 구성 요약 — "의이인 12g · 부평초 12g · 갈근 8g …" */
export function summarizeFormulaHerbs(herbs: Pick<HerbLine, 'herbName' | 'prepMethod' | 'gramsPerPacket'>[], limit = 8): string {
  const parts = herbs.slice(0, limit).map((h) => `${h.herbName}${h.prepMethod ? `-${h.prepMethod}` : ''} ${h.gramsPerPacket}g`);
  return parts.join(' · ') + (herbs.length > limit ? ` …(${herbs.length}종)` : '');
}

/** 현재 입력한 약재 줄(빈 줄 제외)을 처방집에 저장할 약재 목록으로 정리한다. */
export function herbsForFormula(herbs: HerbLine[]): HerbLine[] {
  return herbs
    .filter((h) => h.herbName.trim() !== '' && h.gramsPerPacket > 0)
    .map((h) => ({ herbName: h.herbName.trim(), prepMethod: h.prepMethod.trim(), gramsPerPacket: h.gramsPerPacket }));
}

// ---- JSON 가져오기(다른 자료에서 정리해 온 처방집) ----

type Json = Record<string, unknown>;

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

function pick(obj: Json, keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

/** "6", 6, "6g", "6.5 g" → 숫자. 모르는 값(null·빈 글·숫자 아님)은 0 — 처방전에서 직접 채우게 둔다. */
function gramsOf(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(/\s*g$/i, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

/**
 * JSON 처방집을 처방 목록으로 바꾼다. 최상위는 배열이거나 { formulas: [...] }.
 * 각 처방: { name, nameHanja?, source?, indication?, memo?, herbs: [{ name, prep?, grams }] }
 * (한글 키 처방명·한자명·출전·주치·비고·약재, 약재의 herbName·prepMethod·gramsPerPacket 도 받는다.)
 * 그램을 모르는 약재는 grams 를 null 로 두면 0(미입력)으로 들어간다. 같은 처방명+출전이 두 번이면 뒤엣것을 쓴다.
 */
export function parseFormulaJson(textInput: string, defaultSource = ''): FormulaImportResult & { error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(textInput);
  } catch {
    return { rows: [], skipped: [], error: 'JSON 형식이 아니에요(괄호나 쉼표가 맞는지 확인해 주세요).' };
  }
  const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as Json).formulas) ? ((data as Json).formulas as unknown[]) : null;
  if (!list) return { rows: [], skipped: [], error: '처방 목록(배열)을 찾지 못했어요. [ {...}, {...} ] 모양이어야 해요.' };

  const rows: FormulaImportRow[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const byKey = new Map<string, number>();

  list.forEach((raw, index) => {
    const no = index + 1;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      skipped.push({ line: no, reason: '처방이 객체가 아니에요' });
      return;
    }
    const obj = raw as Json;
    const { name, nameHanja: parsedHanja } = splitFormulaName(text(pick(obj, ['name', '처방명'])));
    if (!name) {
      skipped.push({ line: no, reason: '처방명이 비어 있어요' });
      return;
    }
    const herbsRaw = pick(obj, ['herbs', '약재']);
    if (!Array.isArray(herbsRaw) || herbsRaw.length === 0) {
      skipped.push({ line: no, reason: '약재 목록이 없어요' });
      return;
    }
    const herbs: HerbLine[] = [];
    for (const h of herbsRaw) {
      if (!h || typeof h !== 'object') continue;
      const ho = h as Json;
      const herbName = text(pick(ho, ['name', 'herbName', '약재', '약재명']));
      if (!herbName) continue;
      herbs.push({
        herbName,
        prepMethod: text(pick(ho, ['prep', 'prepMethod', '수치', '포제'])),
        gramsPerPacket: gramsOf(pick(ho, ['grams', 'gramsPerPacket', '용량', '그램'])),
      });
    }
    if (herbs.length === 0) {
      skipped.push({ line: no, reason: '읽을 수 있는 약재가 없어요' });
      return;
    }
    const row: FormulaImportRow = {
      name,
      nameHanja: text(pick(obj, ['nameHanja', 'name_hanja', '한자명', '한자'])) || parsedHanja,
      source: text(pick(obj, ['source', '출전', '서적'])) || defaultSource.trim(),
      indication: text(pick(obj, ['indication', '주치', '효능'])),
      memo: text(pick(obj, ['memo', '비고', '가감'])),
      herbs,
      danglingNames: [],
    };
    const key = `${row.name}\u0000${row.source}`;
    const existing = byKey.get(key);
    if (existing != null) rows[existing] = row;
    else {
      byKey.set(key, rows.length);
      rows.push(row);
    }
  });
  return { rows, skipped };
}

/** "당귀 천궁, 백출" → ['당귀','천궁','백출'] (약재 포함·제외 검색칸 입력). 중복은 하나로. */
export function splitHerbNameList(input: string): string[] {
  return [...new Set(input.split(/[\s,，、·]+/).map((t) => t.trim()).filter(Boolean))];
}
