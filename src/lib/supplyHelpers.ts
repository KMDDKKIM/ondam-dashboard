import type { SupplyRequest } from '@/lib/types';

export const SUPPLY_CATEGORIES = [
  '진료 소모품',
  '침·약침·치료재료',
  '사무용품',
  '청소·위생',
  '간식·음료',
  '기타',
] as const;

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
