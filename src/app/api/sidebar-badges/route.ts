import { NextResponse } from 'next/server';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';
import { createClient } from '@/lib/supabase/server';
import { todayKst } from '@/lib/kst';
import { withTimeout } from '@/lib/withTimeout';
import { getFirstVisitMissing } from '@/lib/reservations/firstVisitMissing.server';
import { getOpenCallCounts } from '@/lib/supabase/happyCallCounts.server';
import { countUnreadNaverTalkTalk } from '@/lib/supabase/naverTalkTalk';
import type { SidebarBadges } from '@/lib/sidebarBadges';

const LOOKUP_TIMEOUT_MS = 8000;

// GET /api/sidebar-badges — 왼쪽 메뉴·상단바의 무거운 숫자 배지. 화면을 막지 않도록 메뉴가 뜬 뒤에
// 따로 읽는다. 값들은 서로 독립이라 하나가 실패하거나 느려도 그 값만 null 이다.
export async function GET() {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const today = todayKst();
  const supabase = await createClient();
  const [openCalls, missingFirstVisits, naverTalkTalkUnread] = await Promise.all([
    withTimeout(
      getOpenCallCounts(today).then((c) => c.open),
      LOOKUP_TIMEOUT_MS
    ),
    withTimeout(
      getFirstVisitMissing(today).then((r) => (r.comparable ? r.missing : 0)),
      LOOKUP_TIMEOUT_MS
    ),
    withTimeout(countUnreadNaverTalkTalk(supabase), LOOKUP_TIMEOUT_MS),
  ]);
  const body: SidebarBadges = { openCalls, missingFirstVisits, naverTalkTalkUnread };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
