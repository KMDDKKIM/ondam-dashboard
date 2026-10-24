import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseReport } from '@/lib/leandietReport';

const MAX_BODY_CHARS = 4_000_000;

function secretMatches(given: string, expected: string): boolean {
  // 길이가 달라도 시간이 같도록 해시끼리 비교한다.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// 원장님 PC의 아침 예약 작업이 보내는 "린다이어트 기록 체크" 리포트를 받는 곳(서버 → 서버).
// 로그인 세션이 없으므로 middleware 에서 이 주소만 열어 두고, 대신 Authorization: Bearer <LEANDIET_INGEST_SECRET> 으로 막는다.
// 같은 reportDate 가 다시 오면 덮어쓴다(upsert). 환자 정보는 로그에 남기지 않고, 응답에도 돌려주지 않는다. CORS 는 열지 않는다.
export async function POST(request: Request) {
  const expected = process.env.LEANDIET_INGEST_SECRET;
  if (!expected) {
    return NextResponse.json({ error: '수신 설정이 아직 되어 있지 않아요.' }, { status: 503 });
  }
  const auth = request.headers.get('authorization') ?? '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!secretMatches(given, expected)) {
    return NextResponse.json({ error: '인증에 실패했어요.' }, { status: 401 });
  }

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: '요청이 너무 커요.' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'JSON 형식이 아니에요.' }, { status: 400 });
  }
  const parsed = parseReport(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { report } = parsed;

  const admin = createAdminClient();
  const { error } = await admin.from('leandiet_daily_reports').upsert(
    {
      report_date: report.reportDate,
      base_date: report.baseDate,
      generated_at: report.generatedAt,
      received_at: new Date().toISOString(),
      criteria: report.criteria,
      summary: report.summary,
      payload: report.patients,
    },
    { onConflict: 'report_date' }
  );
  if (error) return NextResponse.json({ error: '저장하지 못했어요.' }, { status: 500 });
  return NextResponse.json({ ok: true, reportDate: report.reportDate, total: report.summary.total });
}
