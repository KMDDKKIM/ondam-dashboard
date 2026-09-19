import { NextResponse } from 'next/server';
import { ensureDailyRecord, listDailyRecords } from '@/lib/reservations/dailyRecords.server';
import { apiErrorResponse } from '@/lib/apiError';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';

export async function GET() {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  try {
    const records = await listDailyRecords();
    return NextResponse.json(records);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  try {
    const { date } = (await request.json()) as { date: string };
    const id = await ensureDailyRecord(date);
    return NextResponse.json({ id });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
