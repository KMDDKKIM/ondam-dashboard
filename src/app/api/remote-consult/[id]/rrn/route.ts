import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireApprovedStaff } from '@/lib/supabase/requireStaff';
import { formatRrn } from '@/lib/remoteConsult';
import { decryptRrn, parseKey } from '@/lib/rrnCrypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 화면에서 "주민번호 보기"를 눌렀을 때만 그 신청 한 건의 주민번호를 복호화해서 돌려주고,
// 누가 언제 봤는지 remote_consult_rrn_views 에 남긴다. 승인된 직원만 부를 수 있다.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: '잘못된 요청이에요.' }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from('remote_consult_rrn').select('ciphertext').eq('request_id', id).maybeSingle();
  if (error) return NextResponse.json({ error: '불러오지 못했어요.' }, { status: 500 });
  if (!data) return NextResponse.json({ error: '저장된 주민번호가 없어요.' }, { status: 404 });

  let rrn: string;
  try {
    rrn = formatRrn(decryptRrn(data.ciphertext, parseKey(process.env.REMOTE_CONSULT_RRN_KEY)));
  } catch {
    return NextResponse.json({ error: '주민번호를 복호화하지 못했어요.' }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await admin.from('remote_consult_rrn_views').insert({ request_id: id, viewed_by: user?.id ?? null });

  return NextResponse.json({ rrn }, { headers: { 'Cache-Control': 'no-store' } });
}
