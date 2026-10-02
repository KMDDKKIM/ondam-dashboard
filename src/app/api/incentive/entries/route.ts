import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStaff, getCurrentApprovedStaff } from '@/lib/supabase/requireStaff';
import { createEntry, getProfile, listCategories, listEntries } from '@/lib/supabase/incentive';
import { computeEntryIncentive } from '@/lib/incentive';

// GET ?profileId=&month=(YYYY-MM) : 계산된 인센티브 금액까지 포함한 내역 — 원장이거나
// 본인 프로필일 때만. (직원용 "진료 실적 입력" 화면은 /api/incentive/entry-options와
// 별도의 "본인이 입력한 최근 내역"만 보고, 이 엔드포인트는 쓰지 않는다.)
export async function GET(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const me = await getCurrentApprovedStaff();
  if (!me) return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });

  const url = new URL(request.url);
  const profileId = url.searchParams.get('profileId');
  const month = url.searchParams.get('month') ?? undefined;
  if (!profileId) return NextResponse.json({ error: 'profileId가 필요합니다.' }, { status: 400 });

  const admin = createAdminClient();
  try {
    const profile = await getProfile(admin, profileId);
    if (!profile) return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 });
    if (!me.isOwner && profile.staffId !== me.id) {
      return NextResponse.json({ error: '볼 수 없습니다.' }, { status: 403 });
    }
    const [entries, categories] = await Promise.all([listEntries(admin, profileId, month), listCategories(admin, profileId)]);
    const withIncentive = entries.map((e) => ({ ...e, incentiveAmount: computeEntryIncentive(e, categories) }));
    const total = withIncentive.reduce((sum, e) => sum + e.incentiveAmount, 0);
    return NextResponse.json({ entries: withIncentive, total });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '불러오지 못했습니다.' }, { status: 500 });
  }
}

// POST: 실적 한 건 추가 — 승인된 직원 누구나(원장·부원장·팀장·사원). 계산된 인센티브
// 금액은 응답에 담지 않는다 — 민감 정보를 직원 화면에 돌려주지 않기 위함.
export async function POST(request: Request) {
  const denied = await requireApprovedStaff();
  if (denied) return denied;
  const me = await getCurrentApprovedStaff();
  if (!me) return NextResponse.json({ error: '승인된 계정만 사용할 수 있습니다.' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as
    | { profileId?: string; categoryId?: string; entryDate?: string; patientName?: string; amount?: number; note?: string }
    | null;
  if (!body?.profileId || !body.categoryId || !body.entryDate || !body.patientName?.trim()) {
    return NextResponse.json({ error: '필수 항목이 비어 있습니다.' }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    await createEntry(admin, {
      profileId: body.profileId,
      categoryId: body.categoryId,
      entryDate: body.entryDate,
      patientName: body.patientName.trim(),
      amount: body.amount ?? 0,
      note: body.note ?? '',
      createdBy: me.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '추가하지 못했습니다.' }, { status: 500 });
  }
}
