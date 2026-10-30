import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStaff, getCurrentApprovedStaff } from '@/lib/supabase/requireStaff';
import { getProfile, listCategories, listCounts, setCount } from '@/lib/supabase/incentive';
import { countIncentive, isCountCategory, parseCount } from '@/lib/incentive';

const MONTH = /^\d{4}-\d{2}$/;

// GET ?profileId=&month=(YYYY-MM) : 월말 개수를 입력하는 항목(추나 등 건당 고정 금액)과 그 달 개수·지급액 — 원장이거나 본인 프로필일 때만.
// 건당 금액(단가)은 원장에게만 내려준다(부원장은 비율·단가를 못 보게 한 규칙, 2026-10-02) — 부원장에게는 개수와 지급액만 담는다.
export async function GET(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const me = await getCurrentApprovedStaff();
  if (!me) return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });

  const url = new URL(request.url);
  const profileId = url.searchParams.get('profileId');
  const month = url.searchParams.get('month') ?? '';
  if (!profileId || !MONTH.test(month)) return NextResponse.json({ error: 'profileId와 month(YYYY-MM)가 필요합니다.' }, { status: 400 });

  const admin = createAdminClient();
  try {
    const profile = await getProfile(admin, profileId);
    if (!profile) return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 });
    if (!me.isOwner && profile.staffId !== me.id) return NextResponse.json({ error: '볼 수 없습니다.' }, { status: 403 });
    const [categories, counts] = await Promise.all([listCategories(admin, profileId), listCounts(admin, profileId, month)]);
    const rows = categories
      .filter(isCountCategory)
      .map((c) => {
        const count = counts.find((x) => x.categoryId === c.id)?.count ?? 0;
        return { categoryId: c.id, name: c.name, color: c.color, active: c.active, count, amount: countIncentive(count, c), unitAmount: me.isOwner ? c.fixedAmount : null };
      })
      // 쓰지 않는 항목은 그 달에 개수가 있을 때만 보여 준다.
      .filter((r) => r.active || r.count > 0);
    return NextResponse.json({ counts: rows, total: rows.reduce((sum, r) => sum + r.amount, 0) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '불러오지 못했습니다.' }, { status: 500 });
  }
}

// PUT { profileId, categoryId, month, count } : 그 달 개수를 정한다 — 원장이거나 본인 프로필일 때만.
export async function PUT(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const me = await getCurrentApprovedStaff();
  if (!me) return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { profileId?: string; categoryId?: string; month?: string; count?: unknown } | null;
  const count = parseCount(body?.count);
  if (!body?.profileId || !body.categoryId || !MONTH.test(body.month ?? '') || count === null) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const profile = await getProfile(admin, body.profileId);
    if (!profile) return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 });
    if (!me.isOwner && profile.staffId !== me.id) return NextResponse.json({ error: '입력할 수 없습니다.' }, { status: 403 });
    const category = (await listCategories(admin, body.profileId)).find((c) => c.id === body.categoryId);
    if (!category || !isCountCategory(category)) return NextResponse.json({ error: '개수로 입력하는 항목이 아닙니다.' }, { status: 400 });
    await setCount(admin, { profileId: body.profileId, categoryId: body.categoryId, month: body.month as string, count, by: me.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
  }
}
