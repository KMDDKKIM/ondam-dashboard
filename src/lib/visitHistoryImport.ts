// OK차트 "내원일수/진료비 분석" 표(기간 중 내원한 환자 목록)를 읽는다. 순수 함수.
// 머리글 이름(이름·차트번호·등록일·기간중최초·기간중최근 …)으로 칸을 찾으므로 칸 순서가 달라져도 된다.
// 주소·진료비 등 판정에 필요 없는 칸은 읽지 않는다.
import { toRows } from './pasteImport';

export interface VisitHistoryRow {
  chartNo: string;
  patientName: string;
  phone: string | null;
  registeredDate: string | null;
  firstVisit: string | null;
  lastVisit: string | null;
  visitDays: number | null;
  inflow: string | null;
}

export interface VisitHistoryParse {
  /** 표 제목의 분석 기간("2026-06-21~2026-09-21"). 제목이 없으면 환자들의 처음/마지막 내원일로 대신한다. */
  periodStart: string | null;
  periodEnd: string | null;
  periodFromTitle: boolean;
  rows: VisitHistoryRow[];
}

// "2026-09-21 오전 12:00:00" → "2026-09-21"
function datePart(cell: string): string | null {
  const m = cell.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function parseVisitHistory(text: string): VisitHistoryParse | null {
  const rows = toRows(text);
  const headerIdx = rows.findIndex((r) => r.includes('차트번호') && r.includes('이름') && (r.includes('기간중최초') || r.includes('기간중최근')));
  if (headerIdx === -1) return null;

  const header = rows[headerIdx];
  const col = (name: string) => header.indexOf(name);
  const cell = (row: string[], name: string): string => {
    const i = col(name);
    return i === -1 ? '' : (row[i] ?? '').trim();
  };

  const title = rows.slice(0, headerIdx).flat().join(' ');
  const period = title.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);

  const out: VisitHistoryRow[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const chartNo = cell(row, '차트번호');
    const patientName = cell(row, '이름');
    if (!chartNo || !patientName) continue;
    const days = Number(cell(row, '내원일수').replace(/,/g, ''));
    out.push({
      chartNo,
      patientName,
      phone: cell(row, '휴대폰') || null,
      registeredDate: datePart(cell(row, '등록일')),
      firstVisit: datePart(cell(row, '기간중최초')),
      lastVisit: datePart(cell(row, '기간중최근')) ?? datePart(cell(row, '최근내원일')),
      visitDays: Number.isFinite(days) && cell(row, '내원일수') !== '' ? days : null,
      inflow: cell(row, '유입경로') || null,
    });
  }

  if (period) return { periodStart: period[1], periodEnd: period[2], periodFromTitle: true, rows: out };
  const firsts = out.map((r) => r.firstVisit).filter((d): d is string => !!d).sort();
  const lasts = out.map((r) => r.lastVisit).filter((d): d is string => !!d).sort();
  return { periodStart: firsts[0] ?? null, periodEnd: lasts[lasts.length - 1] ?? null, periodFromTitle: false, rows: out };
}
