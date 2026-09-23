import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// 네이버 톡톡 파트너센터의 "알림 API"가 새 메시지를 알려주는 곳. URL을 등록할 때 파트너센터가
// 먼저 이 주소로 확인 요청을 보내는데, 정확한 모양(메서드·본문)이 문서화돼 있지 않아 최대한
// 관대하게 받는다 — 무엇이 와도 200으로 응답하고, "send"(사용자가 메시지 보냄) 이벤트로
// 보이는 것만 골라서 저장한다. 로그인 세션이 없는 외부 호출이라 인증은 따로 없다(IP 확인은
// 이 상품에 적용되는 대역을 몰라 등록 확인 요청까지 막아버려서 뺐다) — 최악의 경우도 배지
// 숫자가 부정확해지는 정도라 위험이 적다. 자동응답은 하지 않는다 — 답장은 그대로
// 톡톡파트너센터에서 직원이 직접 한다.
//
// TEMP(2026-09-23): "알림 API"가 실제로 어떤 모양으로 보내는지 몰라, 무엇이 오든 원문을
// 그대로 기록해 확인 중이다. 모양을 확인하면 이 TEMP 블록을 지우고 제대로 파싱한다.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  let text = '';
  try {
    text = await request.text();
  } catch {
    // 본문을 못 읽어도 200으로 응답한다.
  }

  // TEMP: 실제 페이로드 모양 확인용 — 무엇이 오든 기록한다.
  try {
    const admin = createAdminClient();
    await admin.from('naver_talktalk_events').insert({ naver_user_id: `DEBUG:${text.slice(0, 500)}` });
  } catch {
    // 디버그 기록 실패는 무시한다.
  }

  let body: unknown = null;
  try {
    if (text.trim()) body = JSON.parse(text);
  } catch {
    // 등록 확인 요청처럼 JSON이 아닌 본문(또는 빈 본문)도 올 수 있어 조용히 넘어간다.
  }

  const event = (body as { event?: unknown } | null)?.event;
  const user = (body as { user?: unknown } | null)?.user;
  if (event === 'send' && typeof user === 'string' && user) {
    const admin = createAdminClient();
    const { error } = await admin.from('naver_talktalk_events').insert({ naver_user_id: user });
    if (error) console.error('naver talktalk webhook insert failed', error.code, error.message);
  }
  return NextResponse.json({ ok: true });
}
