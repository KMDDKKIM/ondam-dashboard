import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { firstForwardedIp, isNaverTalkTalkIp } from '@/lib/ipAllowlist';

// 네이버 톡톡 파트너센터가 "send"(사용자가 메시지를 보냄) 이벤트를 알려주는 곳. 로그인 세션이
// 없으므로(네이버 서버가 직접 호출) 서명 대신 네이버가 공개한 IP 대역으로만 받는다
// (src/lib/ipAllowlist.ts). 자동응답은 하지 않는다 — 그냥 기록만 남겨서 상단바 배지에 쓴다.
// 답장은 그대로 톡톡파트너센터에서 직원이 직접 한다.
export async function POST(request: Request) {
  const clientIp = firstForwardedIp(request.headers.get('x-forwarded-for'));
  if (!isNaverTalkTalkIp(clientIp)) {
    return NextResponse.json({ error: 'not allowed' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const event = (body as { event?: unknown } | null)?.event;
  const user = (body as { user?: unknown } | null)?.user;
  // send(메시지) 말고 다른 이벤트(open·friend·echo 등)는 조용히 무시한다 — 200으로 응답해야
  // 네이버 쪽에서 실패로 보고 재시도하지 않는다.
  if (event !== 'send' || typeof user !== 'string' || !user) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('naver_talktalk_events').insert({ naver_user_id: user });
  if (error) {
    console.error('naver talktalk webhook insert failed', error.code, error.message);
    // 저장이 안 돼도 200으로 응답한다 — 실패로 보고 네이버가 재시도하면 같은 메시지가 여러 번 쌓인다.
  }
  return NextResponse.json({ ok: true });
}
