import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';
import { listEntryOptionsForStaff, listRecentEntriesForStaff } from '@/lib/supabase/incentive';

// "진료 실적 입력" 화면(전 직원 공용) 전용 — 원장 선택지·항목 이름·색상만 담고,
// 비율·고정금액 같은 민감 정보는 애초에 이 응답에 넣지 않는다.
// 최근 입력 내역(최대 50건, 전체 원장 공통)도 같이 내려준다 — 역시 계산된 인센티브
// 금액은 담지 않는다(결제금액은 포함 — 직원이 직접 입력한 값이라 이미 알고 있는 정보).
export async function GET() {
  const denied = await requireApprovedStaff();
  if (denied) return denied;

  const admin = createAdminClient();
  try {
    const [options, recent] = await Promise.all([listEntryOptionsForStaff(admin), listRecentEntriesForStaff(admin)]);
    return NextResponse.json({ options, recent });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '불러오지 못했습니다.' }, { status: 500 });
  }
}
