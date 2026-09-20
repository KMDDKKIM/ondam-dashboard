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
  | {
      format: 'daily';
      date: string | null;
      totalRevenue: number;
      visitCount: number | null;
      newPatientCount: number | null;
      /** 숫자가 아닌 값이 들어 있던 칸(예: "총진료비: '12a,000'"). 비어 있지 않으면 저장하지 말고 알려야 한다. */
      invalidCells: string[];
    }
  | { format: 'monthly'; month: string; totalRevenue: number; avgDailyVisits: number | null; invalidCells: string[] }
  | { format: 'unknown'; reason: string };

// OK차트 "일일 결산표"/"월말 결산표"가 공유하는 진료비 요약 헤더 — 헤더 바로 다음
// 줄이 그 날(또는 그 달) 전체 합계 한 행이다. 매출로는 총진료비를 쓴다(보험/자보/
// 산재 청구분도 나중에 들어오는 실제 매출이라 본인부담+비급여만 있는 환자부담계보다
// 총매출 개념에 더 가깝다).
const SETTLEMENT_HEADER = ['내원환자수', '총진료비', '환자부담계', '미수금'];
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

// 숫자로 읽을 수 없으면 null — 예전에는 조용히 0이 되어 매출 0원이 저장될 수 있었다.
export function parseNumber(cell: string): number | null {
  const cleaned = cell.replace(/[,원\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// 셀을 읽어 숫자로 돌려준다. 비어 있으면 null(problems에 안 넣음), 값이 있는데 숫자가
// 아니면 null + problems에 "칸이름: '값'"을 남긴다.
function readNumber(cell: string | undefined, label: string, problems: string[]): number | null {
  const raw = (cell ?? '').trim();
  if (raw === '') return null;
  const n = parseNumber(raw);
  if (n == null) problems.push(`${label}: '${raw}'`);
  return n;
}

const DATE_RE = /\d{4}-\d{2}-\d{2}/;

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

// 일일/월말 결산표 둘 다 "내원환자수 ... 총진료비 ... 환자부담계 ... 미수금" 헤더
// 바로 아래에 합계 한 줄이 온다. 제목 줄(헤더보다 위)의 "진료날짜:YYYY-MM-DD"면
// 당일결산, "월:YYYY-MM"(또는 "(YYYY-MM)월", "월말")이면 월결산으로 구분한다.
function trySettlement(rows: string[][], fallbackDate: string | null): PasteAnalysis | null {
  const headerIdx = findHeaderIndex(rows, SETTLEMENT_HEADER);
  if (headerIdx === -1) return null;

  const header = rows[headerIdx];
  const dataRow = rows[headerIdx + 1];
  const revenueCol = header.indexOf('총진료비');
  if (!dataRow || revenueCol === -1) return null;
  const invalidCells: string[] = [];
  // 총진료비 칸이 비어 있거나 숫자가 아니면 0으로 두되 invalidCells에 남겨 저장을 막는다.
  const totalRevenueRaw = readNumber(dataRow[revenueCol], '총진료비', invalidCells);
  if (totalRevenueRaw == null && invalidCells.length === 0) invalidCells.push('총진료비: (비어 있음)');
  const totalRevenue = totalRevenueRaw ?? 0;

  // 일일결산은 그날 내원환자수를, 월말결산은 진료일평균환자수를 같이 읽는다(없으면 null).
  const visitCol = header.indexOf('내원환자수');
  const avgCol = header.indexOf('진료일평균환자수');
  const visitCount = visitCol !== -1 ? readNumber(dataRow[visitCol], '내원환자수', invalidCells) : null;
  const newCol = header.indexOf('신규환자수');
  const newPatientCount = newCol !== -1 ? readNumber(dataRow[newCol], '신규환자수', invalidCells) : null;
  const avgDailyVisits = avgCol !== -1 ? readNumber(dataRow[avgCol], '진료일평균환자수', invalidCells) : null;

  const context = rows.slice(0, headerIdx).flat().join(' ');

  // 날짜 표기는 두 가지가 있다 — "진료날짜:2026-09-19" 줄, 또는 제목 "일 일 결 산 표:2026-09-19"
  // (OK차트가 글자 사이를 띄워서 내보낸다).
  const dailyMatch =
    context.match(/진료\s*날짜\s*[:：]?\s*(\d{4}-\d{2}-\d{2})/) ??
    context.match(/일\s*일\s*결\s*산\s*표?\s*[:：]?\s*(\d{4}-\d{2}-\d{2})/);
  if (dailyMatch) {
    return { format: 'daily', date: dailyMatch[1], totalRevenue, visitCount, newPatientCount, invalidCells };
  }

  const monthlyMatch =
    context.match(/월\s*[:：]\s*(\d{4}-\d{2})/) ?? context.match(/\((\d{4}-\d{2})\)\s*월/);
  if (monthlyMatch || context.includes('월말')) {
    const month = monthlyMatch?.[1] ?? context.match(/\d{4}-\d{2}/)?.[0];
    if (month) return { format: 'monthly', month, totalRevenue, avgDailyVisits, invalidCells };
  }

  // 제목 표기가 위 어느 쪽도 아니어도, 헤더 위에 날짜(YYYY-MM-DD)가 하나 있으면 그 날짜로 본다.
  const anyDate = context.match(/\d{4}-\d{2}-\d{2}/);
  if (anyDate) return { format: 'daily', date: anyDate[0], totalRevenue, visitCount, newPatientCount, invalidCells };

  // 제목 줄 없이 헤더+합계 행만 붙여넣은 경우 — 당일결산으로 보고 날짜는 직접
  // 지정하게 한다(붙여넣기 칸의 날짜 입력란).
  return { format: 'daily', date: fallbackDate, totalRevenue, visitCount, newPatientCount, invalidCells };
}

export interface ReservationDerivedStats {
  visitCount: number;
  reservationCount: number;
  excludedCount: number;
  excludedNames: string[];
  chunaCount: number;
  chunaNames: string[];
}

// kh-ondam-reservation의 reservationStats.ts와 같은 계산 — 예약시트를 붙여넣을
// 때도 직원 마감 멘트 없이 바로 daily_records의 예약률/부도취소율/추나 통계를
// 채운다(그 저장소는 이제 이 값을 직접 입력받지 않는다).
export function computeReservationDerivedStats(rows: ParsedReservationRow[]): ReservationDerivedStats {
  const excluded = rows.filter((r) => r.visitStatus === '취소');
  const visited = rows.filter((r) => r.visitStatus === '내원');
  const chuna = rows.filter((r) => r.treatmentArea.includes('추나') || r.treatment.includes('추나'));

  return {
    visitCount: visited.length,
    reservationCount: rows.length,
    excludedCount: excluded.length,
    excludedNames: excluded.map((r) => r.patientName).filter(Boolean),
    chunaCount: chuna.length,
    chunaNames: chuna.map((r) => r.patientName).filter(Boolean),
  };
}

export function analyzePasteText(text: string, fallbackDate: string | null = null): PasteAnalysis {
  const rows = toRows(text);
  if (rows.length === 0) {
    return { format: 'unknown', reason: '붙여넣은 내용이 비어 있습니다.' };
  }

  const reservation = tryParseReservation(rows);
  if (reservation) return reservation;

  const settlement = trySettlement(rows, fallbackDate);
  if (settlement) return settlement;

  return {
    format: 'unknown',
    reason: '예약시트/당일결산/월결산 중 어떤 표인지 알아볼 수 없습니다. 헤더 행을 포함해서 붙여넣어 주세요.',
  };
}
