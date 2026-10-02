import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStaff, getCurrentApprovedStaff } from '@/lib/supabase/requireStaff';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { createCategory, getProfile, listCategories } from '@/lib/supabase/incentive';

// GET ?profileId= : 비율·금액까지 포함한 항목 목록 — 원장이거나 본인 프로필일 때만.
// (직원용 "진료 실적 입력" 화면은 이 엔드포인트를 쓰지 않는다 — /api/incentive/entry-options를 쓴다.)
export async function GET(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const me = await getCurrentApprovedStaff();
  if (!me) return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });

  const profileId = new URL(request.url).searchParams.get('profileId');
  if (!profileId) return NextResponse.json({ error: 'profileId가 필요합니다.' }, { status: 400 });

  const admin = createAdminClient();
  try {
    const profile = await getProfile(admin, profileId);
    if (!profile) return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 });
    if (!me.isOwner && profile.staffId !== me.id) {
      return NextResponse.json({ error: '볼 수 없습니다.' }, { status: 403 });
    }
    const categories = await listCategories(admin, profileId);
    return NextResponse.json(categories);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '불러오지 못했습니다.' }, { status: 500 });
  }
}

// POST: 항목(구분) 추가 — 원장 전용.
export async function POST(request: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as
    | {
        profileId?: string;
        name?: string;
        color?: string;
        calcType?: 'percent_of_amount' | 'fixed_per_entry';
        percent?: number | null;
        fixedAmount?: number | null;
        sortOrder?: number;
      }
    | null;
  if (!body?.profileId || !body.name?.trim() || !body.calcType) {
    return NextResponse.json({ error: '필수 항목이 비어 있습니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    await createCategory(admin, {
      profileId: body.profileId,
      name: body.name.trim(),
      color: body.color || '#888888',
      calcType: body.calcType,
      percent: body.percent ?? null,
      fixedAmount: body.fixedAmount ?? null,
      sortOrder: body.sortOrder ?? 0,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '추가하지 못했습니다.' }, { status: 500 });
  }
}
