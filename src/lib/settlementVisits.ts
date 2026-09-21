// 일일 결산표 아래쪽의 "환자 목록"(환자이름·차트번호·진료의·수납 …)을 읽는다. 순수 함수.
// 표 머리글 이름으로 칸을 찾으므로 칸 순서가 달라져도 되고, 같은 표의 맨 위 합계 줄
// (내원환자수·신규환자수 …)은 pasteImport.ts 가 따로 읽는다.
import { parseNumber, toRows } from './pasteImport';

export interface SettlementVisit {
  patientName: string;
  chartNo: string;
  doctorName: string;
  totalFee: number | null;
  patientPay: number | null;
  coverage: string;
  unpaid: number | null;
  cashPay: number | null;
  cardPay: number | null;
}

const NON_PATIENT_NAMES = new Set(['합계', '총계', '소계', '계']);

export function parseSettlementVisits(text: string): SettlementVisit[] {
  const rows = toRows(text);
  const headerIdx = rows.findIndex((r) => r.includes('환자이름') && r.includes('차트번호'));
  if (headerIdx === -1) return [];

  const header = rows[headerIdx];
  const col = (name: string) => header.indexOf(name);
  const cell = (row: string[], name: string): string => {
    const i = col(name);
    return i === -1 ? '' : (row[i] ?? '').trim();
  };
  const num = (row: string[], name: string): number | null => {
    const raw = cell(row, name);
    return raw === '' ? null : parseNumber(raw);
  };

  const visits: SettlementVisit[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const patientName = cell(row, '환자이름');
    if (!patientName || NON_PATIENT_NAMES.has(patientName)) continue;
    visits.push({
      patientName,
      chartNo: cell(row, '차트번호'),
      doctorName: cell(row, '진료의'),
      totalFee: num(row, '총진료비'),
      patientPay: num(row, '환자부담계'),
      coverage: cell(row, '구분'),
      unpaid: num(row, '미수금'),
      cashPay: num(row, '현금수납'),
      cardPay: num(row, '카드수납'),
    });
  }
  return visits;
}
