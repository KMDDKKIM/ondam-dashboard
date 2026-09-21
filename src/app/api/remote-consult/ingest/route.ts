import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { dedupeMaterial, parseFormSubmission } from '@/lib/remoteConsult';
import { encryptRrn, parseKey } from '@/lib/rrnCrypto';

const MAX_BODY_CHARS = 200_000;

function secretMatches(given: string, expected: string): boolean {
  // 길이가 달라도 시간이 같도록 해시끼리 비교한다.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// 구글 시트(Apps Script onFormSubmit)가 비대면진료 폼 응답을 보내 오는 곳. 로그인 세션이 없으므로
// middleware 에서 이 주소만 열어 두고, 대신 공유 비밀값(x-ingest-secret)으로 막는다.
// 응답에는 개인정보를 돌려주지 않는다.
export async function POST(request: Request) {
  const expected = process.env.REMOTE_CONSULT_INGEST_SECRET;
  if (!expected) {
    return NextResponse.json({ error: '수신 설정이 아직 되어 있지 않아요.' }, { status: 503 });
  }
  if (!secretMatches(request.headers.get('x-ingest-secret') ?? '', expected)) {
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
  const namedValues = (body as { namedValues?: unknown } | null)?.namedValues;
  if (!namedValues || typeof namedValues !== 'object' || Array.isArray(namedValues)) {
    return NextResponse.json({ error: 'namedValues 가 없어요.' }, { status: 400 });
  }

  const parsed = parseFormSubmission(namedValues as Record<string, string[] | string>);
  if (!parsed.patientName && !parsed.phone) {
    return NextResponse.json({ error: '성함과 연락처가 모두 비어 있어요.' }, { status: 400 });
  }

  // 주민번호는 저장 전에 먼저 암호화한다(키가 없거나 틀리면 여기서 실패해 아무것도 저장하지 않는다).
  let ciphertext: string | null = null;
  if (parsed.rrn) {
    try {
      ciphertext = encryptRrn(parsed.rrn, parseKey(process.env.REMOTE_CONSULT_RRN_KEY));
    } catch {
      return NextResponse.json({ error: '주민번호 암호화 설정이 되어 있지 않아요.' }, { status: 500 });
    }
  }

  const admin = createAdminClient();
  const dedupeKey = createHash('sha256').update(dedupeMaterial(parsed)).digest('hex');

  const { data: inserted, error } = await admin
    .from('remote_consult_requests')
    .insert({
      source: 'google_form',
      dedupe_key: dedupeKey,
      submitted_at: parsed.submittedAt,
      patient_name: parsed.patientName,
      phone: parsed.phone,
      address: parsed.address,
      rrn_prefix: parsed.rrn ? parsed.rrn.slice(0, 7) : null,
      service: parsed.service,
      answers: parsed.answers,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
    console.error('remote-consult ingest insert failed', error.code, error.message);
    return NextResponse.json({ error: '저장하지 못했어요.' }, { status: 500 });
  }

  if (ciphertext) {
    const { error: rrnError } = await admin.from('remote_consult_rrn').insert({ request_id: inserted.id, ciphertext });
    if (rrnError) {
      // 주민번호만 빠진 채로 남지 않도록 신청도 되돌려서, 시트가 다시 보내게 한다.
      await admin.from('remote_consult_requests').delete().eq('id', inserted.id);
      console.error('remote-consult ingest rrn insert failed', rrnError.code, rrnError.message);
      return NextResponse.json({ error: '저장하지 못했어요.' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, duplicate: false, rrnProblem: parsed.rrnProblem });
}
