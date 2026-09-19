import { NextResponse } from 'next/server';
import { getDailyRecordByDate } from '@/lib/reservations/dailyRecords.server';
import { apiErrorResponse } from '@/lib/apiError';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  try {
    const { id: date } = await params;
    const record = await getDailyRecordByDate(date);
    return NextResponse.json(record);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
