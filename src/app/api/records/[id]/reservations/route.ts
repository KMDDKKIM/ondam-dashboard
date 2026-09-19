import { NextResponse } from 'next/server';
import { replaceReservations } from '@/lib/reservations/dailyRecords.server';
import { apiErrorResponse } from '@/lib/apiError';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';
import type { Reservation } from '@/lib/reservations/types';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  try {
    const { id: dailyRecordId } = await params;
    const { reservations } = (await request.json()) as { reservations: Reservation[] };
    await replaceReservations(dailyRecordId, reservations);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
