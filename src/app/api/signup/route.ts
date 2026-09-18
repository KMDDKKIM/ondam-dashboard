import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const { name, password } = (await request.json()) as {
    name?: string;
    password?: string;
  };

  const trimmedName = name?.trim() ?? '';
  if (!trimmedName) {
    return NextResponse.json({ error: '이름을 입력해주세요.' }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: '비밀번호는 8자 이상이어야 합니다.' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from('staff')
    .select('id')
    .eq('name', trimmedName)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json(
      { error: '이미 사용 중인 이름입니다. 같은 이름이 있다면 원장님께 문의해주세요.' },
      { status: 409 }
    );
  }

  // 로그인은 이름으로 하고, 이메일은 Supabase Auth가 요구해서 넣는 내부용 값일
  // 뿐이다(사람이 보거나 쓰지 않는다) — 이름과 무관하게 임의로 생성해 충돌·인코딩
  // 문제를 피한다.
  const syntheticEmail = `staff-${randomBytes(12).toString('hex')}@ondam.local`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? '계정 생성에 실패했습니다.' },
      { status: 500 }
    );
  }

  const { error: staffInsertError } = await admin.from('staff').insert({
    id: created.user.id,
    name: trimmedName,
    role: 'staff',
    status: 'pending',
  });
  if (staffInsertError) {
    // staff 행 생성이 실패하면 방금 만든 auth 계정을 되돌려, 로그인은 되는데
    // staff 정보가 없는 상태(미들웨어가 pending과 동일하게 막긴 하지만 지저분함)를
    // 남기지 않는다.
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: staffInsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
