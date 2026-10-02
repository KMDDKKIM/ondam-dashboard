import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStaff, getCurrentApprovedStaff } from '@/lib/supabase/requireStaff';
import { requireOwner } from '@/lib/supabase/requireOwner';
import { createCategory, getProfile, listCategories } from '@/lib/supabase/incentive';

// GET ?profileId= : 항목 목록 — 원장이거나 본인 프로필일 때만 볼 수 있다. 비율·고정금액은
// 원장에게만 보여준다(부원장은 본인 항목 이름·색은 보되, 정확한 비율은 못 보게 해달라는
// 요청, 2026-10-02) — 부원장도 실적을 적을 땐 "어떤 구분인지"는 알아야 해서 이름/색/
// 계산방식(금액칸이 필요한지)까지는 내려주고, percent·fixedAmount 숫자만 뺀다.
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
    const visible = me.isOwner ? categories : categories.map((c) => ({ ...c, percent: null, fixedAmount: null }));
    return NextResponse.json(visible);
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
