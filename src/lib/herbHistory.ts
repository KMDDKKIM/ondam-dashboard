import { kstDateOf, kstTimeOf } from '@/lib/kst';
import type { HerbInventoryLog } from '@/lib/types';

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

export interface HerbLogBatch {
  createdAt: string;
  createdBy: string | null;
  note: string | null;
  changes: HerbInventoryLog[];
}

/**
 * "한꺼번에 입력"으로 한 번에 반영한 여러 약재는 같은 트랜잭션이라 created_at이 똑같이 찍힌다
 * (개별 -1/+1 버튼은 이제 없으니, DB 함수는 언제나 "한꺼번에 입력" 한 번 = 트랜잭션 한 번).
 * 그래서 (created_at, created_by)가 같은 로그를 하나로 묶으면 "누가 언제 몇 개를 입력했는지"가 된다.
 * logs는 created_at 내림차순으로 들어온다고 가정한다(listRecentHerbInventoryLogs).
 */
export function groupLogsIntoBatches(logs: readonly HerbInventoryLog[]): HerbLogBatch[] {
  const batches: HerbLogBatch[] = [];
  for (const log of logs) {
    const last = batches[batches.length - 1];
    if (last && last.createdAt === log.createdAt && last.createdBy === log.createdBy) {
      last.changes.push(log);
    } else {
      batches.push({ createdAt: log.createdAt, createdBy: log.createdBy, note: log.note, changes: [log] });
    }
  }
  return batches;
}
