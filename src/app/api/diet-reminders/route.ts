import { NextResponse } from 'next/server';
import { matchReminders } from '@/lib/dietReminders';
import { getDailyRecordByDate } from '@/lib/reservations/dailyRecords.server';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';
import { createClient } from '@/lib/supabase/server';

// GET /api/diet-reminders?date=YYYY-MM-DD — 그 날 예약이 있는 진행 중 린다이어트 환자. 예약관리 표는 로그인 사용자도 직접 못 읽어서
// 서버에서 읽되, 린다이어트 프로그램과 맞는 예약만 돌려준다(예약 명단 전체는 내보내지 않는다).
export async function GET(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: '날짜가 올바르지 않습니다.' }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.from('diet_programs').select('id, patient_name, chart_no').eq('status', 'active');
  if (error) return NextResponse.json({ matches: [] });
  const programs = ((data ?? []) as { id: string; patient_name: string; chart_no: string | null }[]).map((p) => ({ id: p.id, patientName: p.patient_name, chartNo: p.chart_no ?? '' }));
  if (programs.length === 0) return NextResponse.json({ matches: [] });

  try {
    const record = await getDailyRecordByDate(date);
    const reservations = (record?.reservations ?? []).map((r) => ({ patientName: r.patientName, chartNo: r.chartNo, timeLabel: r.timeLabel }));
    return NextResponse.json({ matches: matchReminders(programs, reservations) });
  } catch {
    return NextResponse.json({ matches: [] });
  }
}
