// 비급여 구매 기록 목록의 기간 검색·요약·엑셀 내보내기 준비(순수 함수). 화면/DB 코드는 따로 있다.
import { DEFAULT_RULES, specialCallDates, specialSingleCallDate, type SpecialRules } from './happyCallRules';
import type { GoalCategory, NonCoveredProduct, NonCoveredPurchase } from './types';
import { suggestGoalCategory } from './nonCoveredGoal';

export const ALL_CATEGORIES = '전체';

export interface PurchaseFilter {
  category: string;
  /** 구매일 시작(포함). 비면 제한 없음 */
  from: string;
  /** 구매일 끝(포함). 비면 제한 없음 */
  to: string;
}

/** 구분 탭과 구매일 기간으로 거른다. 시작·끝이 뒤바뀌어 있으면 바로잡아서 쓴다. */
export function filterPurchases(rows: NonCoveredPurchase[], filter: PurchaseFilter): NonCoveredPurchase[] {
  let { from, to } = filter;
  if (from && to && from > to) [from, to] = [to, from];
  return rows.filter((p) => {
    if (filter.category !== ALL_CATEGORIES && p.category !== filter.category) return false;
    if (from && p.purchaseDate < from) return false;
    if (to && p.purchaseDate > to) return false;
    return true;
  });
}

export type PeriodPreset = 'all' | 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear';

export const PERIOD_PRESET_LABEL: Record<PeriodPreset, string> = {
  all: '전체 기간',
  thisMonth: '이번 달',
  lastMonth: '지난 달',
  last3Months: '최근 3개월',
  thisYear: '올해',
};

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 바로 고르기 버튼이 채울 기간(today 는 한국 날짜 YYYY-MM-DD). 최근 3개월은 오늘이 든 달을 포함한 석 달의 첫날부터 오늘까지. */
export function periodRange(preset: PeriodPreset, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  switch (preset) {
    case 'all':
      return { from: '', to: '' };
    case 'thisMonth':
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` };
    case 'lastMonth': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDayOfMonth(py, pm))}` };
    }
    case 'last3Months': {
      const total = y * 12 + (m - 1) - 2;
      const sy = Math.floor(total / 12);
      const sm = (total % 12) + 1;
      return { from: `${sy}-${pad(sm)}-01`, to: today };
    }
    case 'thisYear':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

export interface PurchaseSummary {
  count: number;
  total: number;
  /** 금액을 적지 않은 기록 수 */
  missingAmount: number;
}

export function summarizePurchases(rows: NonCoveredPurchase[]): PurchaseSummary {
  let total = 0;
  let missingAmount = 0;
  for (const p of rows) {
    if (p.amount == null) missingAmount += 1;
    else total += p.amount;
  }
  return { count: rows.length, total, missingAmount };
}

const GOAL_LABEL: Record<GoalCategory, string> = { herb: '한약', diet: '다이어트', special_herb: '특수한약', chuna: '추나' };

export const EXPORT_HEADERS = [
  '구매일', '환자', '차트번호', '구분', '상품', '금액(원)', '진료의', '목표 반영',
  '한약 수령일', '처방일수', '해피콜 1차', '해피콜 2차', '해피콜 3차', '메모', '등록자',
];

/**
 * 엑셀에 담을 행들. 해피콜 일정은 해피콜 규칙(특수한약·그 밖의 비급여) 그대로 — 처방일수가 있으면 1·2·3차(specialCallDates),
 * 수령일만 있으면 규칙의 1회, 수령일이 없으면 비운다. 연락처는 담지 않는다(구매 기록 화면에도 안 보이는 값).
 */
export function purchaseExportRows(rows: NonCoveredPurchase[], creatorName: (createdBy: string | null) => string, rules: SpecialRules = DEFAULT_RULES.special): (string | number | null)[][] {
  return rows.map((p) => {
    let c1 = '';
    let c2 = '';
    let c3 = '';
    if (p.happyCallDate) {
      if (p.durationDays) {
        const d = specialCallDates(rules, p.happyCallDate, p.durationDays);
        [c1, c2, c3] = [d.callDate1 ?? '', d.callDate2 ?? '', d.callDate3 ?? ''];
      } else {
        c1 = specialSingleCallDate(rules, p.happyCallDate) ?? '';
      }
    }
    return [
      p.purchaseDate,
      p.patientName,
      p.chartNo,
      p.category,
      p.productName,
      p.amount,
      p.doctorName ?? '',
      p.goalCategory ? GOAL_LABEL[p.goalCategory] : '',
      p.happyCallDate ?? '',
      p.durationDays,
      c1,
      c2,
      c3,
      p.memo ?? '',
      creatorName(p.createdBy),
    ];
  });
}

/** 비급여_이벤트_2026-09-01_2026-09-30.xlsx — 구분과 기간이 파일 이름에 들어간다. 파일 이름에 쓸 수 없는 글자는 뺀다. */
export function exportFileName(category: string, from: string, to: string): string {
  const cat = (category === ALL_CATEGORIES ? '전체' : category).replace(/[\\/:*?"<>|]/g, '').trim() || '전체';
  const range = from || to ? `_${from || '처음'}_${to || '오늘까지'}` : '';
  return `비급여_${cat}${range}.xlsx`;
}

/** 상품을 골랐을 때 "목표 반영"에 자동으로 채울 값 — 상품 목록에 정해 둔 목표가 있으면 그것, 없으면 상품명으로 짐작(특수한약), 그래도 없으면 없음. */
export function defaultGoalFor(productName: string, products: Pick<NonCoveredProduct, 'name' | 'goalCategory'>[]): GoalCategory | null {
  const found = products.find((p) => p.name === productName);
  return found?.goalCategory ?? suggestGoalCategory(productName);
}
