import { NextResponse } from 'next/server';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';
import { apiErrorResponse } from '@/lib/apiError';
import { getDailyRecordByDate, replaceReservationsForDate } from '@/lib/reservations/dailyRecords.server';
import { fetchGrowthMateReservationsForDate } from '@/lib/growthMate.server';
import { applyGrowthMateStatuses } from '@/lib/growthMateSync';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 핀셋포인트(growth-mate.co.kr)의 정상이행/노쇼/취소를 그 날짜 예약자 명단에 이름으로 대조해
// 채운다. 승인된 직원이면 누구나 누를 수 있다(예약자 명단 자체를 그렇게 열어 둔 것과 같다).
export async function POST(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { date?: unknown } | null;
  const date = body?.date;
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다(YYYY-MM-DD).' }, { status: 400 });
  }

  try {
    const [record, theirs] = await Promise.all([getDailyRecordByDate(date), fetchGrowthMateReservationsForDate(date)]);
    const ours = record?.reservations ?? [];
    if (ours.length === 0) {
      return NextResponse.json({ error: `${date} 예약자 명단이 아직 없어요. 먼저 명단을 붙여넣어 주세요.` }, { status: 400 });
    }

    const { updated, changedCount, unmatchedNames } = applyGrowthMateStatuses(ours, theirs);
    if (changedCount > 0) {
      await replaceReservationsForDate(date, updated);
    }

    return NextResponse.json({ reservations: updated, changedCount, unmatchedNames, fetchedCount: theirs.length });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
