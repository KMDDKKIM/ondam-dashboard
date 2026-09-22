// 접수기록부의 순수 로직(날짜 머리글, 진료비 입력, 하루 합계). 화면/DB 코드는 따로 있다.

/** "제외"는 결제 자체가 없는 경우(린다이어트 상담, 자보 환자 등) — 원장 결정, 2026-09-23. */
export type ReceptionPayment = '현금' | '카드' | '미수' | '제외';
export type ReceptionVisitKind = '초진' | '재초진' | '재진';

export const VISIT_KINDS: ReceptionVisitKind[] = ['초진', '재초진', '재진'];

export const PAYMENTS: ReceptionPayment[] = ['현금', '카드', '미수', '제외'];

export interface ReceptionRecord {
  id: string;
  visitDate: string;
  seq: number;
  visitKind: ReceptionVisitKind;
  patientName: string;
  birthDate: string | null;
  treatment: string | null;
  fee: number | null;
  payment: ReceptionPayment | null;
  reserved: boolean;
  note: string | null;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** YYYY-MM-DD 의 요일 한 글자(일~토). 시간대와 상관없이 날짜 자체로 계산한다. */
export function weekdayKo(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** "9월 21일 월요일" — 종이 노트 머리에 적던 월/일/요일. */
export function formatLogHeader(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 ${weekdayKo(date)}요일`;
}

/** "2,400" · "24000원" · "2400" 같은 입력을 정수로. 비었거나 숫자가 아니면 null. */
export function parseFee(text: string): number | null {
  const digits = text.replace(/[,\s원]/g, '');
  if (digits === '') return null;
  if (!/^\d+$/.test(digits)) return null;
  return Number(digits);
}

/** 생년월일 손글씨 표기("44.6.30")에 맞춰, 숫자 6자리(440630)는 점을 넣어 준다. 그 밖의 입력은 다듬지 않고 그대로 둔다. */
export function normalizeBirth(text: string): string | null {
  const t = text.trim();
  if (t === '') return null;
  const m = t.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}.${Number(m[2])}.${Number(m[3])}`;
  return t;
}

export function formatFee(fee: number | null): string {
  return fee === null ? '' : fee.toLocaleString('ko-KR');
}

export interface ReceptionSummary {
  count: number;
  firstVisitCount: number;
  reservedCount: number;
  feeTotal: number;
  cash: number;
  card: number;
  unpaid: number;
  /** 결제 "제외"로 표시한 줄 수(린다이어트 상담·자보 환자처럼 결제를 안 하는 경우). */
  excluded: number;
  /** 결제 방법을 아직 고르지 않은 줄 수 — 합계 대조 전에 채워야 한다("제외"는 고른 것이라 여기 안 낀다). */
  paymentMissing: number;
}

export function summarize(records: ReceptionRecord[]): ReceptionSummary {
  const s: ReceptionSummary = {
    count: records.length,
    firstVisitCount: 0,
    reservedCount: 0,
    feeTotal: 0,
    cash: 0,
    card: 0,
    unpaid: 0,
    excluded: 0,
    paymentMissing: 0,
  };
  for (const r of records) {
    if (r.visitKind === '초진' || r.visitKind === '재초진') s.firstVisitCount += 1;
    if (r.reserved) s.reservedCount += 1;
    const fee = r.fee ?? 0;
    s.feeTotal += fee;
    if (r.payment === '현금') s.cash += fee;
    else if (r.payment === '카드') s.card += fee;
    else if (r.payment === '미수') s.unpaid += fee;
    else if (r.payment === '제외') s.excluded += 1;
    else if (r.fee !== null) s.paymentMissing += 1;
  }
  return s;
}

/** 접수기록부에서 "예약" 칸에 체크된(다음 예약을 잡은) 줄 수. */
export function countReservedRecords(records: Pick<ReceptionRecord, 'reserved'>[]): number {
  return records.filter((r) => r.reserved).length;
}

/**
 * 일일결산 "다음예약 접수 환자수"를 접수기록부로 미리 채울 값. 채우지 않을 때는 null:
 * 이미 저장해 둔 결산이 있거나(저장 여부를 확인하지 못한 때 포함), 칸에 이미 값이 있거나, 체크된 줄이 하나도 없을 때.
 * (체크가 0개면 0을 채우지 않는다 — 접수기록부의 예약 칸을 쓰지 않은 날과 정말 0명인 날을 구분할 수 없어서.)
 */
export function nextBookingPrefill(
  records: Pick<ReceptionRecord, 'reserved'>[],
  state: { savedClosingExists: boolean; currentValue: string }
): number | null {
  if (state.savedClosingExists || state.currentValue.trim() !== '') return null;
  const count = countReservedRecords(records);
  return count > 0 ? count : null;
}
