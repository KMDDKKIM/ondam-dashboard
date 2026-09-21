import { baseChartNo, normalizePhone } from '@/lib/firstVisit';

// 연락처가 비어 있는 해피콜에 내원 이력(patient_visit_history)에서 번호를 찾아 주는 순수 함수.
// 차트번호가 맞으면 그 번호를, 아니면 "이름이 정확히 같고 번호가 딱 하나"일 때만 쓴다.
// 동명이인이 섞여 있으면 절대 고르지 않는다(잘못된 사람에게 전화하는 것보다 비워 두는 편이 낫다).

export interface HistoryPhoneRow {
  chart_no: string | null;
  patient_name: string | null;
  phone: string | null;
}

export interface PhoneMatch {
  phone: string | null;
  /** 번호를 찾은 근거. 못 찾았거나 애매하면 null */
  source: 'chart' | 'name' | null;
  /** 같은 이름이 여러 명(또는 번호가 서로 다름)이라 고르지 않은 경우 */
  ambiguous: boolean;
}

/** "010-" 처럼 앞자리만 적힌 번호는 걸 수 없으니 쓰지 않는다. */
export function usablePhone(phone: string | null | undefined): string | null {
  const p = (phone ?? '').trim();
  return normalizePhone(p).length >= 9 ? p : null;
}

/** 차트번호 비교용 키: 공백 제거, 재등록 접미사("-1") 제거, 앞의 0 제거. 비어 있으면 ''. */
export function chartKey(chartNo: string | null | undefined): string {
  return baseChartNo(chartNo ?? '').replace(/^0+/, '');
}

const NONE: PhoneMatch = { phone: null, source: null, ambiguous: false };
const AMBIGUOUS: PhoneMatch = { phone: null, source: null, ambiguous: true };

function distinctPhones(rows: HistoryPhoneRow[]): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const p = usablePhone(r.phone);
    if (!p) continue;
    const key = normalizePhone(p);
    if (!seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()];
}

export function matchPhone(call: { patientName: string; chartNo?: string | null }, history: HistoryPhoneRow[]): PhoneMatch {
  const key = chartKey(call.chartNo);
  if (key) {
    const byChart = history.filter((r) => chartKey(r.chart_no) === key);
    if (byChart.length > 0) {
      // 같은 차트번호가 내원 이력에 있으면 이름으로 되돌아가지 않는다(그 차트의 번호가 비어 있어도).
      const exact = byChart.filter((r) => (r.chart_no ?? '').trim() === (call.chartNo ?? '').trim());
      const phones = distinctPhones(exact.length > 0 ? exact : byChart);
      if (phones.length === 1) return { phone: phones[0], source: 'chart', ambiguous: false };
      return phones.length > 1 ? AMBIGUOUS : NONE;
    }
  }

  const name = call.patientName.trim();
  if (!name || name === '-') return NONE;
  const phones = distinctPhones(history.filter((r) => (r.patient_name ?? '').trim() === name));
  if (phones.length === 1) return { phone: phones[0], source: 'name', ambiguous: false };
  return phones.length > 1 ? AMBIGUOUS : NONE;
}
