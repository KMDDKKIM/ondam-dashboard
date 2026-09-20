import { kstDateOf, kstTimeOf } from '@/lib/kst';

/** ISO 시각을 한국 시각 "YYYY-MM-DD HH:mm" 으로. */
export function formatKstDateTime(iso: string): string {
  return `${kstDateOf(iso)} ${kstTimeOf(iso)}`;
}

/** 입고는 +N, 사용은 -N 봉지. */
export function signedChange(changeType: 'use' | 'restock', amount: number): string {
  return `${changeType === 'restock' ? '+' : '-'}${amount}봉지`;
}

/** 처리자 이름. 이름을 못 찾으면(직원이 삭제돼 created_by가 비었거나 목록에 없음) '(삭제된 직원)'. */
export function staffLabel(createdBy: string | null, names: Record<string, string>): string {
  if (createdBy && names[createdBy]) return names[createdBy];
  return '(삭제된 직원)';
}
