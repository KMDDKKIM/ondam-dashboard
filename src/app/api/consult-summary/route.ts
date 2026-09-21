import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { canUseConsultChart, isStaffGrade } from '@/lib/staffGrade';
import { DAILY_SUMMARY_LIMIT, MAX_TRANSCRIPT_CHARS, kstMidnightIso } from '@/lib/consultLimits';

const SYSTEM_PROMPT = `당신은 한의원 진료 상담 녹음 스크립트를 차팅(진료 기록)으로 정리하는 보조원입니다.
아래 형식의 한국어 차팅을 작성하세요. 각 항목은 스크립트에 실제로 언급된 내용만 담고, 언급이 없으면
"언급 없음"이라고 쓰세요. 환자나 보호자가 아닌 제3자 정보, 추측, 진단명 확정은 넣지 마세요 — 스크립트에
나온 표현을 최대한 살려 요약하세요.

## 주소증
## 현병력
## 과거력/기왕력
## 문진 소견
## 변증/진단
## 치료 계획
## 환자 안내사항
## 다음 내원 계획

마크다운 헤더(##)를 그대로 쓰고, 각 항목 아래에 짧은 문장이나 불릿(-)으로 정리하세요. 서론이나 맺음말
없이 바로 "## 주소증"부터 시작하세요.`;

// 티로 등으로 녹음한 상담 내용을 붙여넣으면 Claude가 한의원 차팅 형식으로 정리해준다.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { data: staff } = await supabase.from('staff').select('status, grade').eq('id', user.id).maybeSingle();
  if (staff?.status !== 'approved') {
    return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });
  }
  // 상담 녹음 차팅은 원장님(대표원장·부원장)만 쓴다 — AI 사용 비용과 환자 상담 내용을 함께 지키기 위해서다.
  if (!canUseConsultChart(isStaffGrade(staff?.grade) ? staff.grade : null)) {
    return NextResponse.json({ error: '상담 녹음 차팅은 원장님만 사용할 수 있습니다.' }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[consult-summary] ANTHROPIC_API_KEY is not set');
    return NextResponse.json({ error: '요약 기능이 아직 준비되지 않았습니다. 관리자에게 문의하세요.' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const transcript = body && typeof body.transcript === 'string' ? body.transcript.trim() : '';
  if (!transcript) {
    return NextResponse.json({ error: '붙여넣은 상담 내용이 없습니다.' }, { status: 400 });
  }
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return NextResponse.json(
      {
        error: `상담 내용이 너무 깁니다. ${MAX_TRANSCRIPT_CHARS.toLocaleString('ko-KR')}자 이하로 나누어 넣어주세요. (현재 ${transcript.length.toLocaleString('ko-KR')}자)`,
      },
      { status: 400 }
    );
  }

  // 직원 한 명이 하루(한국 시간 0시부터)에 저장한 차팅이 한도에 이르면 더 만들지 못하게 한다(AI 사용 비용 보호).
  const { count, error: countError } = await supabase
    .from('consult_summaries')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.id)
    .gte('created_at', kstMidnightIso());
  if (countError) {
    console.error('[consult-summary] daily count failed', countError);
    return NextResponse.json({ error: '사용 횟수를 확인하지 못했습니다. 잠시 뒤 다시 시도해주세요.' }, { status: 500 });
  }
  if ((count ?? 0) >= DAILY_SUMMARY_LIMIT) {
    return NextResponse.json(
      { error: `하루에 만들 수 있는 차팅(${DAILY_SUMMARY_LIMIT}건)을 모두 사용했어요. 내일 다시 이용해주세요.` },
      { status: 429 }
    );
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
    });
    const summary = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    if (!summary) {
      console.error('[consult-summary] empty summary from upstream');
      return NextResponse.json({ error: '요약 결과가 비어 있습니다. 다시 시도해주세요.' }, { status: 500 });
    }
    return NextResponse.json({ summary });
  } catch (err) {
    // 외부 AI 서비스가 돌려준 오류 문구는 화면에 그대로 보여주지 않는다(서버 로그에만 남긴다).
    console.error('[consult-summary] upstream error', err);
    return NextResponse.json({ error: '요약 중 오류가 발생했습니다. 잠시 뒤 다시 시도해주세요.' }, { status: 500 });
  }
}
