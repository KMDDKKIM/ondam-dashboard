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
}

export interface HerbCareEntry {
  patientName: string;
  chartNo: string;
  prescriptionName: string;
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

/** 한 줄 상태 — "4/15일째", "수령 전", "종료 3일 지남". */
export function herbCareStatus(e: HerbCareEntry): string {
  if (e.endedDays > 0) return `종료 ${e.endedDays}일 지남`;
  if (e.dayNo <= 0) return `복용 시작 D-${1 - e.dayNo}`;
  return e.days > 0 ? `${e.dayNo}/${e.days}일째` : `${e.dayNo}일째`;
}
