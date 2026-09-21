import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { generateTempPassword } from '@/lib/tempPassword';
import { checkResetTarget } from '@/lib/resetPasswordGuard';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const GENERIC_ERROR = '비밀번호를 재설정하지 못했습니다. 잠시 후 다시 시도해주세요.';

// 직원 비밀번호 재설정(대표원장 전용). 임시 비밀번호를 만들어 계정에 적용하고,
// 응답에 딱 한 번만 돌려준다. 비밀번호는 로그에 남기지 않는다.
export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { staffId?: unknown } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }
  const { staffId } = body;
  if (typeof staffId !== 'string' || !UUID_PATTERN.test(staffId)) {
    return NextResponse.json({ error: '재설정할 직원을 지정해주세요.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: target, error: lookupError } = await admin
    .from('staff')
    .select('id, role, status')
    .eq('id', staffId)
    .maybeSingle();
  if (lookupError) {
    console.error('reset-password: staff lookup failed', lookupError.message);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  const verdict = checkResetTarget(target, user.id);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.error }, { status: verdict.status });
  }

  const password = generateTempPassword();
  const { error: updateError } = await admin.auth.admin.updateUserById(staffId, { password });
  if (updateError) {
    console.error('reset-password: update failed', updateError.status, updateError.message);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  return NextResponse.json({ password }, { headers: NO_STORE });
}
