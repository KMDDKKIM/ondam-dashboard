import type {
  DailyRecordSummary,
  WeeklyStats,
} from './types';

export function getWeekRange(referenceDate: Date): { start: Date; end: Date } {
  const day = referenceDate.getDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + diffToMonday);

  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function sum(values: (number | null)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

export function computeWeeklyStats(
  records: DailyRecordSummary[],
  referenceDate: Date
): WeeklyStats {
  const { start, end } = getWeekRange(referenceDate);
  const inWeek = records.filter((record) => {
    const recordDate = new Date(`${record.date}T00:00:00`);
    return recordDate >= start && recordDate <= end;
  });

  const nogyongTotal = sum(inWeek.map((r) => r.nogyongCount));
  const ilbanTotal = sum(inWeek.map((r) => r.ilbanCount));

  return {
    nogyongTotal,
    ilbanTotal,
    herbTotal: nogyongTotal + ilbanTotal,
    chunaTotal: sum(inWeek.map((r) => r.chunaCount)),
    dietTotal: sum(inWeek.map((r) => r.dietCount)),
    specialAcupunctureTotal: sum(inWeek.map((r) => r.specialAcupunctureCount)),
  };
}
