import { NextResponse } from 'next/server';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';
import { createClient } from '@/lib/supabase/server';
import { markNaverTalkTalkRead } from '@/lib/supabase/naverTalkTalk';

// POST /api/naver-talktalk-mark-read — 상단바 네이버톡톡 아이콘을 누르면 안읽은 배지를 비운다.
export async function POST() {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const supabase = await createClient();
  try {
    await markNaverTalkTalkRead(supabase);
  } catch {
    return NextResponse.json({ error: '읽음 처리에 실패했어요.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
