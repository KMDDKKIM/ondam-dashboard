// 케어 보드의 "한약 복용중" 명단(순수 로직) — 환자별로 가장 최근 처방전 하나만 보고, 복용 일차와 끝나는 날을 계산한다.
// 수령예정일을 아직 안 넣은 처방전은 처방일을 시작일로 대신 쓰고 "수령일 미입력"으로 표시한다(원장 결정, 2026-10-20).

import { addDaysKst, diffDaysKst } from './kst';
import { orderDays } from './herbCallSchedule';

export interface HerbCareOrder {
  patientName: string;
  chartNo: string;
  prescriptionName: string;
  orderDate: string;
  pickupDate: string | null;
  daysSupply: number | null;
  packetCount: number | null;
  /** 처방전에 넣은 약재 이름(처방명을 안 적었을 때 대신 보여 주는 용도) */
  herbNames?: string[];
}

export interface HerbCareEntry {
  patientName: string;
  chartNo: string;
  prescriptionName: string;
  herbNames: string[];
  orderDate: string;
  /** 복용 시작일(수령예정일, 없으면 처방일) */
  startDate: string;
  pickupMissing: boolean;
  /** 며칠분(0이면 모름) */
  days: number;
  /** 복용이 끝나는 날(며칠분을 모르면 null) */
  endDate: string | null;
  /** 오늘이 복용 며칠째인지(시작 전이면 0 이하) */
  dayNo: number;
  /** 끝난 지 며칠 됐는지(아직이면 0) */
  endedDays: number;
}

/** 한약을 아직 먹고 있거나 끝난 지 얼마 안 된 환자(기본 14일 안). 끝나는 날이 가까운 순. */
export function buildHerbCare(orders: HerbCareOrder[], today: string, recentEndedDays = 14): HerbCareEntry[] {
  const latest = new Map<string, HerbCareOrder>();
  for (const o of orders) {
    const key = o.chartNo ? `c:${o.chartNo}` : `n:${o.patientName}`;
    const cur = latest.get(key);
    if (!cur || o.orderDate > cur.orderDate) latest.set(key, o);
  }
  const entries: HerbCareEntry[] = [];
  for (const o of latest.values()) {
    const startDate = o.pickupDate ?? o.orderDate;
    const days = orderDays({ daysSupply: o.daysSupply, packetCount: o.packetCount });
    const endDate = days > 0 ? addDaysKst(startDate, days - 1) : null;
    const endedDays = endDate && today > endDate ? diffDaysKst(endDate, today) : 0;
    if (endDate ? endedDays > recentEndedDays : diffDaysKst(startDate, today) > 30) continue;
    entries.push({
      patientName: o.patientName,
      chartNo: o.chartNo,
      prescriptionName: o.prescriptionName,
      herbNames: o.herbNames ?? [],
      orderDate: o.orderDate,
      startDate,
      pickupMissing: o.pickupDate == null,
      days,
      endDate,
      dayNo: diffDaysKst(startDate, today) + 1,
      endedDays,
    });
  }
  return entries.sort((a, b) => (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999') || a.patientName.localeCompare(b.patientName, 'ko'));
}

/**
 * 처방 이름 — 처방명을 적었으면 그대로, 안 적었으면 처방전에 넣은 약재 몇 개로 대신 보여 준다("약재: 당귀·천궁·백출 외 9종").
 * 약재도 없으면 빈 문자열.
 */
export function prescriptionLabel(e: Pick<HerbCareEntry, 'prescriptionName' | 'herbNames'>, maxHerbs = 3): string {
  const name = e.prescriptionName.trim();
  if (name) return name;
  const herbs = e.herbNames.filter(Boolean);
  if (herbs.length === 0) return '';
  const head = herbs.slice(0, maxHerbs).join('·');
  return `약재: ${head}${herbs.length > maxHerbs ? ` 외 ${herbs.length - maxHerbs}종` : ''}`;
}

/** 한 줄 상태 — "4/15일째", "수령 전", "종료 3일 지남". */
export function herbCareStatus(e: HerbCareEntry): string {
  if (e.endedDays > 0) return `종료 ${e.endedDays}일 지남`;
  if (e.dayNo <= 0) return `복용 시작 D-${1 - e.dayNo}`;
  return e.days > 0 ? `${e.dayNo}/${e.days}일째` : `${e.dayNo}일째`;
}

export interface CallRecord {
  callDate: string;
  done: boolean;
  /** 결과를 기록한 시각(ISO). 아직 아무도 전화하지 않은 해피콜은 null */
  completedAt: string | null;
}

export interface CallSummary {
  /** 마지막으로 해피콜을 한(부재중 시도 포함) 날짜 */
  lastCallDate: string | null;
  /** 앞으로 걸 해피콜 중 가장 이른 날짜 */
  nextCallDate: string | null;
}

/**
 * 한 환자의 해피콜 요약 — 마지막으로 전화한 날과 다음 해피콜 날짜. 전화한 날은 결과를 기록한 시각(한국 날짜)으로 보고,
 * 다음 해피콜은 아직 끝나지 않은 해피콜 중 예정일이 가장 이른 것이다(예정일이 이미 지난 것도 포함 — 밀린 해피콜이다).
 */
export function summarizeCalls(records: CallRecord[], kstDateOf: (iso: string) => string): CallSummary {
  const called = records.flatMap((r) => (r.completedAt ? [kstDateOf(r.completedAt)] : [])).sort();
  const upcoming = records.filter((r) => !r.done).map((r) => r.callDate).sort();
  return { lastCallDate: called.length > 0 ? called[called.length - 1] : null, nextCallDate: upcoming.length > 0 ? upcoming[0] : null };
}
