import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// 네이버 톡톡 파트너센터의 "알림 API"가 새 대화/메시지를 알려주는 곳. 슬랙 인커밍 웹훅과 같은
// 모양으로 온다: { username, icon_url, text }(2026-09-23 실제 호출로 확인 — 문서가 따로 없다).
// 사용자 식별값이 따로 없어 표시 이름(username)을 naver_user_id 칸에 넣는다(이름이 없을 때는
// "톡톡"으로 채운다). 메시지 내용(text)은 저장하지 않는다 — 배지 개수만 필요하다. 로그인
// 세션이 없는 외부 호출이라 인증은 따로 없다 — 최악의 경우도 배지 숫자만 부정확해진다.
// 자동응답은 하지 않는다 — 답장은 그대로 톡톡파트너센터에서 직원이 직접 한다.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    const raw = await request.text();
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    // 등록 확인 요청처럼 JSON이 아닌 본문(또는 빈 본문)도 올 수 있어 조용히 넘어간다.
  }

  const text = (body as { text?: unknown } | null)?.text;
  const username = (body as { username?: unknown } | null)?.username;
  if (typeof text === 'string' && text.trim()) {
    const admin = createAdminClient();
    const senderName = typeof username === 'string' && username.trim() ? username.trim() : '톡톡';
    const { error } = await admin.from('naver_talktalk_events').insert({ naver_user_id: senderName });
    if (error) console.error('naver talktalk webhook insert failed', error.code, error.message);
  }
  return NextResponse.json({ ok: true });
}
