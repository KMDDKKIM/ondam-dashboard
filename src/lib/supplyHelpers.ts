import { diffDaysKst, kstDateOf } from '@/lib/kst';
import type { SupplyRequest } from '@/lib/types';

export const SUPPLY_CATEGORIES = [
  '한약재·의약품',
  '조제·탕전용품',
  '치료 소모품',
  '사무·원무',
  '청소·위생',
  '간식·음료',
  '기타',
] as const;

// 분류 이름만으로 뜻이 애매한 것에 붙이는 보조 설명(선택 목록에만 표시).
export const SUPPLY_CATEGORY_HINT: Record<string, string> = {
  '사무·원무': '용지, 문구류 등',
};

export type SupplyStatus = 'requested' | 'ordered' | 'received';

export const STATUS_LABEL: Record<SupplyStatus, string> = {
  requested: '신청됨',
  ordered: '주문완료',
  received: '도착완료',
};

export function supplyStatus(r: Pick<SupplyRequest, 'orderedAt' | 'receivedAt'>): SupplyStatus {
  if (r.receivedAt) return 'received';
  if (r.orderedAt) return 'ordered';
  return 'requested';
}

export type SupplyFilter = 'open' | SupplyStatus | 'all';

// 기본 화면은 아직 도착 안 한 것(open)만 — 끝난 건 "도착완료" 탭에서 본다.
export function matchesFilter(r: Pick<SupplyRequest, 'orderedAt' | 'receivedAt'>, filter: SupplyFilter): boolean {
  if (filter === 'all') return true;
  const status = supplyStatus(r);
  if (filter === 'open') return status !== 'received';
  return status === filter;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 주문 링크는 사용자가 붙여넣는 값이라 http(s)만 링크로 쓴다(javascript: 등 차단).
export function safeUrl(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export type AgingLevel = 'none' | 'yellow' | 'red';

export interface AgingBadge {
  label: string;
  level: AgingLevel;
  days: number;
}

export const AGING_YELLOW_DAYS = 3;
export const AGING_RED_DAYS = 7;

// 아직 도착하지 않은 신청의 경과일 배지. 신청됨은 신청일, 주문완료는 주문일 기준(한국 날짜).
// 도착완료는 표시할 것이 없어 null. today 는 YYYY-MM-DD(한국 날짜).
export function agingBadge(
  status: SupplyStatus,
  requestedAt: string,
  orderedAt: string | null,
  today: string
): AgingBadge | null {
  if (status === 'received') return null;
  const base = status === 'ordered' && orderedAt ? orderedAt : requestedAt;
  const days = Math.max(0, diffDaysKst(kstDateOf(base), today));
  const level: AgingLevel = days >= AGING_RED_DAYS ? 'red' : days >= AGING_YELLOW_DAYS ? 'yellow' : 'none';
  const prefix = status === 'ordered' ? '주문 후' : '신청';
  return { label: days === 0 ? `${prefix} 오늘` : `${prefix} ${days}일째`, level, days };
}

// 중복 비교용 품목명: 앞뒤 공백 제거, 소문자, 모든 공백 제거.
export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '');
}

// 새 품목명과 같은 이름의 "아직 도착 안 한" 신청들(이미 도착한 건 중복이 아님).
export function findOpenDuplicates<T extends Pick<SupplyRequest, 'itemName' | 'orderedAt' | 'receivedAt'>>(
  itemName: string,
  requests: T[]
): T[] {
  const key = normalizeItemName(itemName);
  if (!key) return [];
  return requests.filter((r) => supplyStatus(r) !== 'received' && normalizeItemName(r.itemName) === key);
}

// 진행 중 탭 정렬: 주문 대기(신청됨) 먼저, 그다음 도착 대기(주문완료). 각 묶음 안에서는 오래된 신청부터.
export function sortOpenOldestFirst<T extends Pick<SupplyRequest, 'requestedAt' | 'orderedAt' | 'receivedAt'>>(
  requests: T[]
): T[] {
  const rank = (r: T) => (supplyStatus(r) === 'requested' ? 0 : 1);
  return [...requests].sort(
    (a, b) => rank(a) - rank(b) || new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime()
  );
}

export interface OpenSupplyCounts {
  waitingOrder: number;
  waitingArrival: number;
}

// 주문 대기(신청됨) / 도착 대기(주문완료) 건수.
export function countOpen(requests: Pick<SupplyRequest, 'orderedAt' | 'receivedAt'>[]): OpenSupplyCounts {
  let waitingOrder = 0;
  let waitingArrival = 0;
  for (const r of requests) {
    const status = supplyStatus(r);
    if (status === 'requested') waitingOrder++;
    else if (status === 'ordered') waitingArrival++;
  }
  return { waitingOrder, waitingArrival };
}
