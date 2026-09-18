// 엑셀에서 표를 복사해 그대로 붙여넣은 텍스트(탭으로 칸 구분, 줄바꿈으로 행 구분)를
// 분석해서 예약시트/당일결산/월결산 중 어떤 표인지 알아내고 구조화한다.
// 헤더 이름으로 컬럼을 찾기 때문에 컬럼 순서가 달라져도 동작한다(kh-ondam-reservation의
// xlsxParser와 같은 방식).

export interface ParsedReservationRow {
  doctorName: string;
  timeLabel: string;
  patientName: string;
  chartNo: string;
  phone: string;
  mobile: string;
  visitStatus: string;
  treatmentArea: string;
  treatment: string;
  specialNotes: string;
  memo: string;
}

export interface ReservationDateGroup {
  date: string;
  rows: ParsedReservationRow[];
}

export type PasteAnalysis =
  | { format: 'reservation'; groups: ReservationDateGroup[] }
  | { format: 'daily'; date: string | null; totalRevenue: number; rowCount: number }
  | { format: 'monthly'; rows: { date: string; totalRevenue: number }[] }
  | { format: 'unknown'; reason: string };

const REVENUE_ALIASES = ['수납총액', '수납액', '총수납액', '결제금액'];
const DATE_COL_ALIASES = ['일자', '날짜'];
const RESERVATION_REQUIRED = [
  '내원',
  '취소',
  '예약시각',
  '환자명',
  '차트번호',
  '핸드폰',
  '전화',
  '진료의',
  '진료구분',
  '진료항목',
  '진료패키지',
  '예약메모',
];

function toRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split('\t').map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell !== ''));
}

function findHeaderIndex(rows: string[][], mustInclude: string[]): number {
  return rows.findIndex((row) => mustInclude.every((name) => row.includes(name)));
}

function findColumn(header: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = header.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseNumber(cell: string): number {
  const cleaned = cell.replace(/[,원\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const DATE_RE = /\d{4}-\d{2}-\d{2}/;
const MONTH_ANCHOR_RE = /\d{4}-\d{2}/;
const MD_RE = /^\d{1,2}-\d{1,2}$/;

function tryParseReservation(rows: string[][]): PasteAnalysis | null {
  const headerIdx = findHeaderIndex(rows, ['환자명', '예약일자']);
  if (headerIdx === -1) return null;

  const header = rows[headerIdx];
  const missing = RESERVATION_REQUIRED.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    return { format: 'unknown', reason: `예약시트로 보이지만 컬럼이 부족합니다: ${missing.join(', ')}` };
  }

  const col = (name: string) => header.indexOf(name);
  const patientCol = col('환자명');
  const dateCol = col('예약일자');

  const byDate = new Map<string, ParsedReservationRow[]>();
  for (const row of rows.slice(headerIdx + 1)) {
    const patientName = row[patientCol] ?? '';
    if (!patientName.trim()) continue;
    const date = (row[dateCol] ?? '').trim();
    if (!DATE_RE.test(date)) continue;

    const cancelled = row[col('취소')] ?? '';
    const visited = row[col('내원')] ?? '';
    const treatmentType = row[col('진료항목')] ?? '';
    const treatmentPackage = row[col('진료패키지')] ?? '';

    const parsed: ParsedReservationRow = {
      doctorName: row[col('진료의')] ?? '',
      timeLabel: row[col('예약시각')] ?? '',
      patientName,
      chartNo: row[col('차트번호')] ?? '',
      phone: row[col('전화')] ?? '',
      mobile: row[col('핸드폰')] ?? '',
      visitStatus: cancelled.trim() || visited.trim(),
      treatmentArea: row[col('진료구분')] ?? '',
      treatment: [treatmentType, treatmentPackage].filter(Boolean).join(' '),
      specialNotes: '',
      memo: row[col('예약메모')] ?? '',
    };
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(parsed);
  }

  if (byDate.size === 0) {
    return { format: 'unknown', reason: '예약시트 헤더는 찾았지만 유효한 예약일자가 있는 행이 없습니다.' };
  }

  const groups = Array.from(byDate.entries())
    .map(([date, rowsForDate]) => ({ date, rows: rowsForDate }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { format: 'reservation', groups };
}

function tryParseMonthly(rows: string[][]): PasteAnalysis | null {
  const dateAlias = DATE_COL_ALIASES.find((alias) => rows.some((r) => r.includes(alias)));
  if (!dateAlias) return null;
  const headerIdx = rows.findIndex((r) => r.includes(dateAlias) && REVENUE_ALIASES.some((a) => r.includes(a)));
  if (headerIdx === -1) return null;

  const header = rows[headerIdx];
  const dateCol = header.indexOf(dateAlias);
  const revenueCol = findColumn(header, REVENUE_ALIASES);
  if (revenueCol === -1) return null;

  const titleAnchor = rows.slice(0, headerIdx).flat().join(' ').match(MONTH_ANCHOR_RE)?.[0] ?? null;

  const result: { date: string; totalRevenue: number }[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const raw = (row[dateCol] ?? '').trim();
    let date: string | null = null;
    if (DATE_RE.test(raw)) date = raw.match(DATE_RE)![0];
    else if (MD_RE.test(raw) && titleAnchor) {
      const day = raw.split('-')[1].padStart(2, '0');
      date = `${titleAnchor}-${day}`;
    }
    if (!date) continue;
    result.push({ date, totalRevenue: parseNumber(row[revenueCol] ?? '0') });
  }

  if (result.length < 2) return null; // 날짜가 하나뿐이면 당일결산으로 취급한다.
  return { format: 'monthly', rows: result };
}

function tryParseDaily(rows: string[][], fallbackDate: string | null): PasteAnalysis | null {
  const headerIdx = rows.findIndex((r) => r.includes('차트번호') && REVENUE_ALIASES.some((a) => r.includes(a)));
  if (headerIdx === -1) return null;

  const header = rows[headerIdx];
  const chartCol = header.indexOf('차트번호');
  const revenueCol = findColumn(header, REVENUE_ALIASES);
  if (revenueCol === -1) return null;

  let total = 0;
  let rowCount = 0;
  for (const row of rows.slice(headerIdx + 1)) {
    if (!(row[chartCol] ?? '').trim()) continue;
    total += parseNumber(row[revenueCol] ?? '0');
    rowCount += 1;
  }

  const titleDate = rows.slice(0, headerIdx).flat().join(' ').match(DATE_RE)?.[0] ?? null;
  return { format: 'daily', date: titleDate ?? fallbackDate, totalRevenue: total, rowCount };
}

export function analyzePasteText(text: string, fallbackDate: string | null = null): PasteAnalysis {
  const rows = toRows(text);
  if (rows.length === 0) {
    return { format: 'unknown', reason: '붙여넣은 내용이 비어 있습니다.' };
  }

  const reservation = tryParseReservation(rows);
  if (reservation) return reservation;

  const monthly = tryParseMonthly(rows);
  if (monthly) return monthly;

  const daily = tryParseDaily(rows, fallbackDate);
  if (daily) return daily;

  return {
    format: 'unknown',
    reason: '예약시트/당일결산/월결산 중 어떤 표인지 알아볼 수 없습니다. 헤더 행을 포함해서 붙여넣어 주세요.',
  };
}
