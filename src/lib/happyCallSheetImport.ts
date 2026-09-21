// 구글시트(초진환자 해피콜 표)에서 복사한 내용을 등록 가능한 행으로 바꾼다. 순수 함수.
// - 첫 줄이 머리글(성함/진료의/구분 …)이면 머리글 이름으로 칸을 찾아서 열 순서가 달라도 된다.
// - 머리글 없이 붙여넣으면 이 화면 표의 순서(초진/재초진·연락처·차트번호 제외)로 본다.
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
  | 'revisit3'
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
  재내원1: 'revisit1',
  재내원2: 'revisit2',
  재내원3: 'revisit3',
  자보약1: 'jaboHerb1',
  자보약2: 'jaboHerb2',
  자보약3: 'jaboHerb3',
  메모: 'memo',
  비고: 'memo',
};

// 머리글이 없을 때 쓰는 열 순서 — 예전 구글시트/이 화면 표의 순서.
export const DEFAULT_COLUMN_ORDER: SheetField[] = [
  'patientName',
  'doctorName',
  'patientType',
  'acupuncture',
  'nextVisitNote',
  'callLog',
  'firstVisitDate',
  'revisit1',
  'revisit2',
  'revisit3',
  'jaboHerb1',
  'jaboHerb2',
  'jaboHerb3',
  'memo',
];

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
  revisit3: string | null;
  jaboHerb1: string | null;
  jaboHerb2: string | null;
  jaboHerb3: string | null;
  memo: string | null;
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

export function parseSheetPaste(text: string, today: string): SheetParseResult {
  const table = parseTsv(text);
  if (table.length === 0) return { rows: [], headerFound: false, ignoredHeaders: [] };

  const header = detectHeader(table[0]);
  const fields: (SheetField | null)[] = header ? header.fields : DEFAULT_COLUMN_ORDER;
  const dataRows = header ? table.slice(1) : table;
  const baseYear = Number(today.slice(0, 4));

  const rows: ParsedSheetRow[] = dataRows.map((cells, idx) => {
    const get = (field: SheetField): string => {
      const col = fields.indexOf(field);
      return col === -1 ? '' : (cells[col] ?? '');
    };
    const errors: string[] = [];

    const patientName = get('patientName').trim();
    if (!patientName) errors.push('성함이 비어 있어요');

    const doctorName = normalizeDoctorName(get('doctorName'));
    if (!doctorName) errors.push('진료의가 비어 있어요');

    const rawType = get('patientType');
    const patientType = normalizePatientType(rawType);
    if (!patientType) errors.push(rawType.trim() ? `구분 "${rawType.trim()}"을(를) 알 수 없어요 (건보/자보/비급여)` : '구분이 비어 있어요');

    const rawFirst = get('firstVisitDate');
    const firstVisitDate = parseSheetDate(rawFirst, baseYear);
    if (!firstVisitDate) errors.push(rawFirst.trim() ? `초진일 "${rawFirst.trim()}"을(를) 읽지 못했어요` : '초진일이 비어 있어요');

    const rawAcu = get('acupuncture');
    const acupuncture = normalizeAcupuncture(rawAcu);
    if (rawAcu.trim() && !acupuncture) errors.push(`약침/패키지구분 "${rawAcu.trim()}"은(는) 성공·실패·비포함 중 하나여야 해요`);

    const dateField = (field: SheetField, label: string): string | null => {
      const raw = get(field);
      if (!raw.trim()) return null;
      const parsed = parseSheetDate(raw, firstVisitDate ? Number(firstVisitDate.slice(0, 4)) : baseYear, firstVisitDate);
      if (!parsed) errors.push(`${label} "${raw.trim()}"을(를) 읽지 못했어요`);
      return parsed;
    };

    const visitKindRaw = get('visitKind').replace(/\s+/g, '');

    return {
      rowNumber: idx + 1,
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
      revisit1: dateField('revisit1', '재내원1'),
      revisit2: dateField('revisit2', '재내원2'),
      revisit3: dateField('revisit3', '재내원3'),
      jaboHerb1: dateField('jaboHerb1', '자보약1'),
      jaboHerb2: dateField('jaboHerb2', '자보약2'),
      jaboHerb3: dateField('jaboHerb3', '자보약3'),
      memo: empty(get('memo')),
      errors,
    };
  });

  return { rows, headerFound: header !== null, ignoredHeaders: header?.ignored ?? [] };
}

export type ImportStatus = 'ready' | 'exists' | 'duplicate-in-paste' | 'error';

// 행마다 등록 가능 여부를 정한다 — 오류가 있으면 error, 같은 이름+초진일이 이미 등록돼 있으면 exists,
// 붙여넣은 표 안에서 같은 이름+초진일이 또 나오면 두 번째부터 duplicate-in-paste.
export function classifyRows(
  rows: ParsedSheetRow[],
  existing: { patientName: string; firstVisitDate: string }[]
): ImportStatus[] {
  const existingKeys = new Set(existing.map((p) => `${p.patientName}|${p.firstVisitDate}`));
  const seen = new Set<string>();
  return rows.map((r) => {
    if (r.errors.length > 0 || !r.firstVisitDate) return 'error';
    const key = `${r.patientName}|${r.firstVisitDate}`;
    if (existingKeys.has(key)) return 'exists';
    if (seen.has(key)) return 'duplicate-in-paste';
    seen.add(key);
    return 'ready';
  });
}
