// 한약 패키지(선결제 일수) 잔여 계산(순수 로직) — 원장 요청 2026-10-21.
// 3개월 결제는 90일분, 1개월 결제는 30일분이고, 처방전이 15일·30일·10일씩 나갈 때마다 며칠분을 차감한다. 잔액은 따로 저장하지 않고
// "패키지 일수 합계 − 결제일 이후 출력한 처방전의 며칠분 합계"로 계산해서, 처방전을 지우거나 고쳐도 저절로 맞는다.

import { orderDays } from './herbCallSchedule';

/** 이 일수 이상 결제해야 패키지로 본다(1개월=30일 이상). 그보다 짧은 한 번짜리 결제는 패키지로 만들지 않는다. */
export const MIN_PACKAGE_DAYS = 30;

export interface PackageSource {
  productName: string;
  goalCategory: string | null;
  durationDays: number | null;
}

/**
 * 비급여 결제에서 한약 패키지 일수를 알아낸다. 한약(목표 반영: 한약) 결제만 보고, 상품명에 "3개월"이 있으면 90일, "1개월"(또는 한 달)이면
 * 30일, 이름에 없으면 처방일수 칸 값(30일 이상일 때)을 쓴다. 패키지가 아니면 null.
 */
export function packageDaysFromPurchase(p: PackageSource): number | null {
  if (p.goalCategory !== 'herb') return null;
  const name = p.productName.replace(/\s+/g, '');
  const months = name.match(/(\d+)개월/);
  if (months) {
    const days = Number(months[1]) * 30;
    return days >= MIN_PACKAGE_DAYS ? days : null;
  }
  if (/한달/.test(name)) return 30;
  const d = Number(p.durationDays ?? 0);
  return d >= MIN_PACKAGE_DAYS ? Math.round(d) : null;
}

export interface PackageRow {
  totalDays: number;
  /** 결제일 — 이 날짜 이후(같은 날 포함) 출력한 처방전부터 차감 */
  startDate: string;
}

export interface PrintedOrder {
  orderDate: string;
  daysSupply?: number | null;
  packetCount?: number | null;
}

export interface PackageBalance {
  totalDays: number;
  usedDays: number;
  /** 남은 일수(다 쓰고 넘게 처방했으면 0) */
  remainingDays: number;
  /** 패키지를 넘겨 처방한 일수(넘기지 않았으면 0) */
  overDays: number;
}

/** 환자의 패키지 잔액. 패키지가 하나도 없으면 null. */
export function packageBalance(packages: PackageRow[], printedOrders: PrintedOrder[]): PackageBalance | null {
  if (packages.length === 0) return null;
  const start = packages.map((p) => p.startDate).sort()[0];
  const totalDays = packages.reduce((acc, p) => acc + p.totalDays, 0);
  const usedDays = printedOrders.filter((o) => o.orderDate >= start).reduce((acc, o) => acc + orderDays({ daysSupply: o.daysSupply, packetCount: o.packetCount }), 0);
  return { totalDays, usedDays, remainingDays: Math.max(0, totalDays - usedDays), overDays: Math.max(0, usedDays - totalDays) };
}

export interface PackageNote {
  level: 'ok' | 'warn';
  text: string;
}

/**
 * 처방전 화면 안내 — 이번 처방(thisDays일분)을 내보내면 잔여가 얼마가 되는지, 패키지를 넘기면 경고. 이번 처방전이 이미 출력돼 잔액에 들어
 * 있으면 balance 를 구할 때 그 처방전을 빼고 넘겨야 한다.
 */
export function packageNote(balance: PackageBalance | null, thisDays: number): PackageNote | null {
  if (!balance) return null;
  const head = `한약 패키지 잔여 ${balance.remainingDays}일 (총 ${balance.totalDays}일 중 ${balance.usedDays}일 사용)`;
  if (balance.overDays > 0 || balance.remainingDays === 0) {
    return { level: 'warn', text: `${head} — 패키지를 다 썼어요. 이번 ${thisDays > 0 ? `${thisDays}일분은` : '처방은'} 추가 결제가 필요해요` };
  }
  if (thisDays <= 0) return { level: 'ok', text: head };
  const after = balance.remainingDays - thisDays;
  if (after < 0) return { level: 'warn', text: `${head} — 이번 ${thisDays}일분은 ${-after}일을 넘어요. 추가 결제가 필요해요` };
  return { level: 'ok', text: `${head} → 이번 ${thisDays}일분 처방 후 ${after}일 남아요` };
}

/** 처방전 출력을 마친 뒤 안내 — "○○님 한약 패키지 잔여 15일". 패키지를 다 썼으면 경고. 패키지가 없으면 null. */
export function packageAfterPrintText(patientName: string, balance: PackageBalance | null): PackageNote | null {
  if (!balance) return null;
  const who = patientName.trim() ? `${patientName.trim()}님 ` : '';
  const head = `${who}한약 패키지 잔여 ${balance.remainingDays}일 (총 ${balance.totalDays}일 중 ${balance.usedDays}일 사용)`;
  if (balance.overDays > 0) return { level: 'warn', text: `${head} — 패키지를 ${balance.overDays}일 넘겨 처방했어요. 추가 결제를 확인해 주세요` };
  if (balance.remainingDays === 0) return { level: 'warn', text: `${head} — 패키지를 모두 사용했어요. 다음 처방은 추가 결제가 필요해요` };
  return { level: 'ok', text: head };
}

export interface PackageRecord {
  patientName: string;
  chartNo: string;
  totalDays: number;
  startDate: string;
}

export interface PackageOrderRecord {
  patientName: string;
  chartNo: string;
  orderDate: string;
  daysSupply?: number | null;
  packetCount?: number | null;
}

export interface PackageOverviewRow extends PackageBalance {
  patientName: string;
  chartNo: string;
  /** 첫 결제일 */
  firstPaidDate: string;
  /** 마지막 결제일 */
  lastPaidDate: string;
  /** 패키지 결제 횟수 */
  packageCount: number;
  /** 마지막 처방일(출력한 처방전 기준, 없으면 null) */
  lastOrderDate: string | null;
}

function patientKey(p: { patientName: string; chartNo: string }): string {
  return p.chartNo.trim() ? `c:${p.chartNo.trim()}` : `n:${p.patientName.trim()}`;
}

/**
 * 한약 패키지 현황 — 환자별로 결제 일수, 처방한 일수, 남은 일수를 모은다. 차트번호가 있으면 차트번호로, 없으면 이름으로 환자를 묶고
 * 처방전은 차트번호가 같거나(차트번호가 비어 있는 처방전은) 이름이 같으면 그 환자의 것으로 본다. 남은 일수가 적은 환자가 위, 다 쓴 환자는 아래.
 */
export function buildPackageOverview(packages: PackageRecord[], printedOrders: PackageOrderRecord[]): PackageOverviewRow[] {
  const groups = new Map<string, PackageRecord[]>();
  for (const p of packages) {
    const key = patientKey(p);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const rows: PackageOverviewRow[] = [];
  for (const list of groups.values()) {
    const chartNo = list[0].chartNo.trim();
    const name = list[0].patientName.trim();
    const mine = printedOrders.filter((o) => (chartNo ? o.chartNo.trim() === chartNo || (!o.chartNo.trim() && o.patientName.trim() === name) : o.patientName.trim() === name));
    const balance = packageBalance(list.map((p) => ({ totalDays: p.totalDays, startDate: p.startDate })), mine) as PackageBalance;
    const starts = list.map((p) => p.startDate).sort();
    const counted = mine.filter((o) => o.orderDate >= starts[0]).map((o) => o.orderDate).sort();
    rows.push({
      ...balance,
      patientName: list[0].patientName,
      chartNo: list[0].chartNo,
      firstPaidDate: starts[0],
      lastPaidDate: starts[starts.length - 1],
      packageCount: list.length,
      lastOrderDate: counted.length > 0 ? counted[counted.length - 1] : null,
    });
  }
  return rows.sort((a, b) => Number(a.remainingDays === 0) - Number(b.remainingDays === 0) || a.remainingDays - b.remainingDays || a.patientName.localeCompare(b.patientName, 'ko'));
}
