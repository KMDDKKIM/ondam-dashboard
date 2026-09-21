// 구글시트(초진환자 해피콜 표)에서 복사한 내용을 등록 가능한 행으로 바꾼다. 순수 함수.
// - 첫 줄이 머리글(성함/진료의/구분 …)이면 머리글 이름으로 칸을 찾아서 열 순서가 달라도 된다.
// - 머리글이 없으면 실제 시트의 열 위치(성함 → 진료의 → 구분 → 약침 → 다음내원메모 → 통화내역 → 초진일 →
//   재내원1~3 → 자보약1~3 → 메모, 사이사이 빈 열 포함)를 성함이 나오는 칸을 기준으로 찾는다. 맨 앞에 빈 열이 있어도
//   되고, 그 뒤의 계산 칸(주차 코드, 숫자 등)은 읽지 않는다. 그 위치가 안 맞으면 이 화면 표의 순서로 다시 본다.
// - 셀 안에 줄바꿈이 있어 한 줄이 둘로 쪼개진 경우(따옴표가 없을 때)도 이어 붙인다.
// - 날짜는 2026-09-14 / 2026. 9. 14 / 26.09.14 / 9/14 / 9월 14일 처럼 시트에서 흔한 모양을 다 받는다.

export type SheetField =
  | 'patientName'
  | 'doctorName'
  | 'patientType'
  | 'visitKind'
  | 'phone'
  | 'chartNo'
  | 'acupuncture'
  | 'nextVisitNote'
  | 'callLog'
  | 'firstVisitDate'
  | 'revisit1'
  | 'revisit2'
  | 'jaboHerb1'
  | 'jaboHerb2'
  | 'jaboHerb3'
  | 'memo';

// 머리글 이름(공백 제거) → 칸. 자주 쓰는 다른 표기도 같이 받는다.
const HEADER_ALIASES: Record<string, SheetField> = {
  성함: 'patientName',
  환자명: 'patientName',
  이름: 'patientName',
  성명: 'patientName',
  진료의: 'doctorName',
  담당의: 'doctorName',
  주치의: 'doctorName',
  구분: 'patientType',
  환자구분: 'patientType',
  '초진/재초진': 'visitKind',
  초진구분: 'visitKind',
  연락처: 'phone',
  전화번호: 'phone',
  핸드폰: 'phone',
  차트번호: 'chartNo',
  '약침/패키지구분': 'acupuncture',
  약침패키지구분: 'acupuncture',
  '약침/패키지': 'acupuncture',
  약침패키지: 'acupuncture',
  다음내원메모: 'nextVisitNote',
  다음내원: 'nextVisitNote',
  통화내역: 'callLog',
  초진일: 'firstVisitDate',
  초진날짜: 'firstVisitDate',
  // 시트 머리글: 초진일 칸 = "1진", 재내원일 칸 = "2진"·"3진", 자보약 처방 = "1차약"·"2차약"·"3차약"
  '1진': 'firstVisitDate',
  '2진': 'revisit1',
  '3진': 'revisit2',
  재내원1: 'revisit1',
  재내원2: 'revisit2',
  '1차약': 'jaboHerb1',
  '2차약': 'jaboHerb2',
  '3차약': 'jaboHerb3',
  자보약1: 'jaboHerb1',
  자보약2: 'jaboHerb2',
  자보약3: 'jaboHerb3',
  메모: 'memo',
  비고: 'memo',
};

type Layout = Partial<Record<SheetField, number>>;

// 실제 구글시트의 열 위치 — 성함 칸(n)을 0으로 두고 오른쪽으로 센 거리.
// 성함 · 진료의 · 구분 · (빈 칸) · 약침 · 다음내원메모 · (빈 칸 5) · 통화내역 · (빈 칸 5) · 1진(초진일) · 2진 · 3진 · 1차약~3차약 · 메모
const SHEET_LAYOUT: Layout = {
  patientName: 0,
  doctorName: 1,
  patientType: 2,
  visitKind: 3,
  acupuncture: 4,
  nextVisitNote: 5,
  callLog: 11,
  firstVisitDate: 17,
  revisit1: 18,
  revisit2: 19,
  jaboHerb1: 20,
  jaboHerb2: 21,
  jaboHerb3: 22,
  memo: 23,
};
// 시트에서 3차약 뒤로 메모 칸이 한두 칸 더 떨어져 있을 수 있어, 메모 칸이 비면 이 칸도 본다.
const SHEET_MEMO_FALLBACK_OFFSET = 24;

// 빈 열 없이 이 화면 표의 순서(초진/재초진·연락처·차트번호 제외)로 붙여넣었을 때.
const PAGE_LAYOUT: Layout = {
  patientName: 0,
  doctorName: 1,
  patientType: 2,
  acupuncture: 3,
  nextVisitNote: 4,
  callLog: 5,
  firstVisitDate: 6,
  revisit1: 7,
  revisit2: 8,
  jaboHerb1: 9,
  jaboHerb2: 10,
  jaboHerb3: 11,
  memo: 12,
};

export interface ParsedSheetRow {
  rowNumber: number; // 붙여넣은 표에서의 줄 번호(머리글 제외, 1부터)
  patientName: string;
  doctorName: string;
  patientType: '건보' | '자보' | '비급여' | null;
  visitKind: '초진' | '재초진';
  phone: string | null;
  chartNo: string | null;
  acupuncture: '성공' | '실패' | '비포함' | null;
  nextVisitNote: string | null;
  callLog: string | null;
  firstVisitDate: string | null;
  revisit1: string | null;
  revisit2: string | null;
  jaboHerb1: string | null;
  jaboHerb2: string | null;
  jaboHerb3: string | null;
  memo: string | null;
  /** 구분이 "기타"였다 — 등록하려면 건보/자보/비급여 중 어디로 넣을지 사용자가 골라야 한다. */
  isOtherType: boolean;
  /** 막지는 않지만 알려 둘 것(등록하지 않고 건너뛴 날짜 등). */
  notes: string[];
  errors: string[];
}

export interface SheetParseResult {
  rows: ParsedSheetRow[];
  headerFound: boolean;
  /** 머리글에 있었지만 알아보지 못해 버린 칸 이름. */
  ignoredHeaders: string[];
}

// 구글시트가 복사할 때 줄바꿈·따옴표가 들어간 칸을 "..."로 감싸는 것까지 처리하는 TSV 분해.
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      inQuotes = true;
    } else if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 시트의 날짜 글자를 YYYY-MM-DD 로. 연도가 없으면 baseYear 를 쓰고, 기준일(notBefore)보다 앞서 버리면
// 해를 넘긴 것으로 보고 한 해를 더한다(재내원이 연말→연초로 넘어가는 경우). 못 읽으면 null.
export function parseSheetDate(text: string, baseYear: number, notBefore?: string | null): string | null {
  const t = text.trim();
  if (!t) return null;

  const full = t.match(/^(\d{2,4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\.?$/);
  if (full) {
    let y = Number(full[1]);
    if (full[1].length <= 2) y += 2000;
    const m = Number(full[2]);
    const d = Number(full[3]);
    return isRealDate(y, m, d) ? ymd(y, m, d) : null;
  }

  const short = t.match(/^(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})\s*(?:일)?\.?$/);
  if (short) {
    const m = Number(short[1]);
    const d = Number(short[2]);
    let y = baseYear;
    if (!isRealDate(y, m, d)) return null;
    let result = ymd(y, m, d);
    if (notBefore && result < notBefore) {
      y += 1;
      if (isRealDate(y, m, d)) result = ymd(y, m, d);
    }
    return result;
  }

  return null;
}

function normalizeHeader(cell: string): string {
  return cell.replace(/\s+/g, '').toLowerCase();
}

function detectHeader(row: string[]): { fields: (SheetField | null)[]; ignored: string[] } | null {
  const fields = row.map((c) => HEADER_ALIASES[normalizeHeader(c)] ?? null);
  const recognized = fields.filter((f) => f !== null);
  // 알아본 머리글이 2개 이상이고 성함 칸이 있어야 머리글 줄로 본다(데이터 줄을 머리글로 착각하지 않도록).
  if (recognized.length < 2 || !recognized.includes('patientName')) return null;
  const ignored = row.filter((c, i) => fields[i] === null && c.trim() !== '').map((c) => c.trim());
  return { fields, ignored };
}

function isKnownTypeToken(v: string): boolean {
  const t = v.replace(/\s+/g, '');
  return normalizePatientType(t) !== null || t === '기타';
}

function normalizePatientType(v: string): ParsedSheetRow['patientType'] {
  const t = v.replace(/\s+/g, '');
  if (t === '건보' || t === '건강보험') return '건보';
  if (t === '자보' || t === '자동차보험') return '자보';
  if (t === '비급여') return '비급여';
  return null;
}

function normalizeAcupuncture(v: string): ParsedSheetRow['acupuncture'] {
  const t = v.replace(/\s+/g, '');
  if (t === '성공' || t === '실패' || t === '비포함') return t;
  return null;
}

// "김동규 원장", "김동규님" 처럼 붙은 호칭을 떼고 이름만 남긴다.
export function normalizeDoctorName(v: string): string {
  return v.trim().replace(/(선생님|원장님|원장|님)$/u, '').trim();
}

function empty(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

function firstNonEmptyIndex(cells: string[]): number {
  return cells.findIndex((c) => c.trim() !== '');
}

// 맨 뒤 초진일 칸까지 못 미치는 짧은 줄 다음에, 앞쪽이 텅 빈 줄이 오면 셀 안의 줄바꿈이 줄을 쪼갠 것이다.
// (구글시트가 따옴표 없이 붙여넣어졌을 때.) 쪼개진 셀을 원래대로 다시 붙인다.
function mergeBrokenRows(table: string[][]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < table.length; i++) {
    let cur = table[i];
    const start = firstNonEmptyIndex(cur);
    while (start !== -1 && cur.length < start + SHEET_LAYOUT.firstVisitDate! + 1 && i + 1 < table.length) {
      const next = table[i + 1];
      const nextStart = firstNonEmptyIndex(next);
      if (nextStart <= 3) break; // 새 환자 줄이다
      cur = [...cur.slice(0, -1), `${cur[cur.length - 1]}\n${next[0]}`, ...next.slice(1)];
      i++;
    }
    out.push(cur);
  }
  return out;
}

function buildRow(get: (field: SheetField) => string, rowNumber: number, baseYear: number): ParsedSheetRow {
  const errors: string[] = [];
  const notes: string[] = [];

  const patientName = get('patientName').trim();
  if (!patientName) errors.push('성함이 비어 있어요');

  const doctorName = normalizeDoctorName(get('doctorName'));
  if (!doctorName) errors.push('진료의가 비어 있어요');

  const rawType = get('patientType').trim();
  const isOtherType = rawType.replace(/\s+/g, '') === '기타';
  const patientType = normalizePatientType(rawType);
  if (!patientType && !isOtherType) {
    errors.push(rawType ? `구분 "${rawType}"을(를) 알 수 없어요 (건보/자보/비급여)` : '구분이 비어 있어요');
  }

  const rawFirst = get('firstVisitDate');
  const firstVisitDate = parseSheetDate(rawFirst, baseYear);
  if (!firstVisitDate) errors.push(rawFirst.trim() ? `초진일 "${rawFirst.trim()}"을(를) 읽지 못했어요` : '초진일이 비어 있어요');

  const rawAcu = get('acupuncture');
  const acupuncture = normalizeAcupuncture(rawAcu);
  if (rawAcu.trim() && !acupuncture) errors.push(`약침/패키지구분 "${rawAcu.trim()}"은(는) 성공·실패·비포함 중 하나여야 해요`);

  const dateField = (field: SheetField, label: string, mustBeAfterFirstVisit: boolean): string | null => {
    const raw = get(field);
    if (!raw.trim()) return null;
    const parsed = parseSheetDate(raw, firstVisitDate ? Number(firstVisitDate.slice(0, 4)) : baseYear, firstVisitDate);
    if (!parsed) {
      errors.push(`${label} "${raw.trim()}"을(를) 읽지 못했어요`);
      return null;
    }
    // 초진 당일이거나 그 전 날짜는 재내원이 아니다(시트에서 같은 날짜를 한 번 더 적은 경우) — 건너뛰고 알려 준다.
    if (mustBeAfterFirstVisit && firstVisitDate && parsed <= firstVisitDate) {
      notes.push(`${label}(${parsed})이 초진일과 같거나 빨라서 등록하지 않았어요`);
      return null;
    }
    return parsed;
  };

  const visitKindRaw = get('visitKind').replace(/\s+/g, '');

  return {
    rowNumber,
    patientName,
    doctorName,
    patientType,
    visitKind: visitKindRaw.includes('재') ? '재초진' : '초진',
    phone: empty(get('phone')),
    chartNo: empty(get('chartNo')),
    acupuncture,
    nextVisitNote: empty(get('nextVisitNote')),
    callLog: empty(get('callLog')),
    firstVisitDate,
    revisit1: dateField('revisit1', '2진', true),
    revisit2: dateField('revisit2', '3진', true),
    jaboHerb1: dateField('jaboHerb1', '자보약1', false),
    jaboHerb2: dateField('jaboHerb2', '자보약2', false),
    jaboHerb3: dateField('jaboHerb3', '자보약3', false),
    memo: empty(get('memo')),
    isOtherType,
    notes,
    errors,
  };
}

export function parseSheetPaste(text: string, today: string): SheetParseResult {
  const table = parseTsv(text);
  if (table.length === 0) return { rows: [], headerFound: false, ignoredHeaders: [] };

  const baseYear = Number(today.slice(0, 4));
  const header = detectHeader(table[0]);

  if (header) {
    const rows = table.slice(1).map((cells, idx) =>
      buildRow(
        (field) => {
          const col = header.fields.indexOf(field);
          return col === -1 ? '' : (cells[col] ?? '');
        },
        idx + 1,
        baseYear
      )
    );
    return { rows, headerFound: true, ignoredHeaders: header.ignored };
  }

  const merged = mergeBrokenRows(table);
  const rows = merged.map((cells, idx) => {
    const n = Math.max(0, firstNonEmptyIndex(cells));
    // 실제 시트 위치로 보고, 구분 칸과 초진일 칸이 그 자리에서 읽히지 않으면 이 화면 표의 순서로 다시 본다.
    const sheetTypeCell = cells[n + SHEET_LAYOUT.patientType!] ?? '';
    const sheetDateCell = cells[n + SHEET_LAYOUT.firstVisitDate!] ?? '';
    const useSheetLayout = isKnownTypeToken(sheetTypeCell) && parseSheetDate(sheetDateCell, baseYear) !== null;
    const layout = useSheetLayout ? SHEET_LAYOUT : PAGE_LAYOUT;
    return buildRow(
      (field) => {
        const offset = layout[field];
        if (offset === undefined) return '';
        const value = cells[n + offset] ?? '';
        if (field === 'memo' && layout === SHEET_LAYOUT && !value.trim()) return cells[n + SHEET_MEMO_FALLBACK_OFFSET] ?? '';
        return value;
      },
      idx + 1,
      baseYear
    );
  });
  return { rows, headerFound: false, ignoredHeaders: [] };
}

export type ImportStatus = 'ready' | 'exists' | 'duplicate-in-paste' | 'error';

// 행마다 등록 가능 여부를 정한다 — 오류가 있으면 error, 같은 이름+초진일이 이미 등록돼 있으면 exists,
// 붙여넣은 표 안에서 같은 이름+초진일이 또 나오면 두 번째부터 duplicate-in-paste.
export function classifyRows(
  rows: ParsedSheetRow[],
  existing: { patientName: string; firstVisitDate: string }[]
): ImportStatus[] {
  // 구분이 "기타"인 줄은 화면에서 등록할 구분을 정한 뒤 patientType 을 채워서 이 함수에 넘긴다.
  const existingKeys = new Set(existing.map((p) => `${p.patientName}|${p.firstVisitDate}`));
  const seen = new Set<string>();
  return rows.map((r) => {
    if (r.errors.length > 0 || !r.firstVisitDate || !r.patientType) return 'error';
    const key = `${r.patientName}|${r.firstVisitDate}`;
    if (existingKeys.has(key)) return 'exists';
    if (seen.has(key)) return 'duplicate-in-paste';
    seen.add(key);
    return 'ready';
  });
}
