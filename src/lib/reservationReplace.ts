// 예약 명단을 붙여넣어 저장하면 그 날짜의 기존 명단이 통째로 대체된다. 저장 전에 날짜별로
// "기존 N명 → 새 N명"을 보여 주고, 새 명단이 기존의 절반 미만이면 한 번 더 경고한다.
import { formatMonthDay } from './closingChecks';

export interface ReplaceSummaryLine {
  date: string;
  oldCount: number;
  newCount: number;
  /** 새 명단이 기존의 50% 미만(기존이 있을 때만) */
  drastic: boolean;
}

export function summarizeReplace(
  groups: { date: string; newCount: number }[],
  existingCounts: Record<string, number>
): ReplaceSummaryLine[] {
  return groups.map((g) => {
    const oldCount = existingCounts[g.date] ?? 0;
    return { date: g.date, oldCount, newCount: g.newCount, drastic: oldCount > 0 && g.newCount < oldCount * 0.5 };
  });
}

export function replaceConfirmMessage(lines: ReplaceSummaryLine[]): string {
  const rows = lines.map((l) => `${formatMonthDay(l.date)}: 기존 ${l.oldCount}명 → 새 ${l.newCount}명`);
  const drastic = lines.filter((l) => l.drastic);
  const parts = ['예약 명단을 대체합니다.', '', ...rows];
  if (drastic.length > 0) {
    parts.push(
      '',
      `⚠ ${drastic.map((l) => formatMonthDay(l.date)).join(', ')}: 새 명단이 기존의 절반도 안 돼요. 일부만 복사한 건 아닌지 확인해 주세요.`
    );
  }
  parts.push('', '계속할까요?');
  return parts.join('\n');
}
