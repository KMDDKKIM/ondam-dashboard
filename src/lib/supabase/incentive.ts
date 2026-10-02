import type { SupabaseClient } from '@supabase/supabase-js';
import { nextMonthFirstDay, type IncentiveCalcType, type IncentiveCategory, type IncentiveEntry } from '@/lib/incentive';

// 이 파일의 함수는 전부 admin(service_role) 클라이언트로만 호출한다 — 일반 로그인
// 클라이언트는 RLS가 막아 애초에 쓸 수 없다(migration_incentive.sql 참고). "누가 뭘
// 볼 수 있는지"는 이 함수들을 부르는 API 라우트(src/app/api/incentive/...)가 정한다.

export interface IncentiveProfile {
  id: string;
  staffId: string;
  staffName: string;
  note: string;
  active: boolean;
}

interface ProfileRow {
  id: string;
  staff_id: string;
  note: string | null;
  active: boolean;
  staff: { name: string } | { name: string }[] | null;
}

function staffNameOf(staff: ProfileRow['staff']): string {
  if (!staff) return '';
  return Array.isArray(staff) ? (staff[0]?.name ?? '') : staff.name;
}

function rowToProfile(r: ProfileRow): IncentiveProfile {
  return { id: r.id, staffId: r.staff_id, staffName: staffNameOf(r.staff), note: r.note ?? '', active: r.active };
}

export async function listProfiles(admin: SupabaseClient): Promise<IncentiveProfile[]> {
  const { data, error } = await admin
    .from('incentive_profiles')
    .select('id, staff_id, note, active, staff:staff_id(name)')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as unknown as ProfileRow[]).map(rowToProfile);
}

export async function getProfile(admin: SupabaseClient, id: string): Promise<IncentiveProfile | null> {
  const { data, error } = await admin
    .from('incentive_profiles')
    .select('id, staff_id, note, active, staff:staff_id(name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data as unknown as ProfileRow) : null;
}

export async function getProfileByStaffId(admin: SupabaseClient, staffId: string): Promise<IncentiveProfile | null> {
  const { data, error } = await admin
    .from('incentive_profiles')
    .select('id, staff_id, note, active, staff:staff_id(name)')
    .eq('staff_id', staffId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToProfile(data as unknown as ProfileRow) : null;
}

export async function hasActiveProfile(admin: SupabaseClient, staffId: string): Promise<boolean> {
  const { count, error } = await admin
    .from('incentive_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('staff_id', staffId)
    .eq('active', true);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export interface NewProfile {
  staffId: string;
  note: string;
  /** 새 부원장 프로필을 만들 때, 기존 프로필의 항목(구분/비율)을 그대로 복사해 올 프로필 id(선택). */
  cloneFromProfileId?: string;
}

export async function createProfile(admin: SupabaseClient, input: NewProfile): Promise<IncentiveProfile> {
  const { data, error } = await admin
    .from('incentive_profiles')
    .insert({ staff_id: input.staffId, note: input.note || null })
    .select('id, staff_id, note, active, staff:staff_id(name)')
    .single();
  if (error) throw error;
  const profile = rowToProfile(data as unknown as ProfileRow);

  if (input.cloneFromProfileId) {
    const sourceCategories = await listCategories(admin, input.cloneFromProfileId);
    if (sourceCategories.length > 0) {
      const { error: cloneError } = await admin.from('incentive_categories').insert(
        sourceCategories.map((c, i) => ({
          profile_id: profile.id,
          name: c.name,
          color: c.color,
          calc_type: c.calcType,
          percent: c.percent,
          fixed_amount: c.fixedAmount,
          sort_order: i,
        }))
      );
      if (cloneError) throw cloneError;
    }
  }
  return profile;
}

export async function updateProfile(admin: SupabaseClient, id: string, patch: { note?: string; active?: boolean }): Promise<void> {
  const { error } = await admin
    .from('incentive_profiles')
    .update({ ...(patch.note !== undefined ? { note: patch.note } : {}), ...(patch.active !== undefined ? { active: patch.active } : {}) })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProfile(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin.from('incentive_profiles').delete().eq('id', id);
  if (error) throw error;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  calc_type: IncentiveCalcType;
  percent: number | null;
  fixed_amount: number | null;
  active: boolean;
}

function rowToCategory(r: CategoryRow): IncentiveCategory {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    calcType: r.calc_type,
    percent: r.percent != null ? Number(r.percent) : null,
    fixedAmount: r.fixed_amount != null ? Number(r.fixed_amount) : null,
    active: r.active,
  };
}

export async function listCategories(admin: SupabaseClient, profileId: string): Promise<IncentiveCategory[]> {
  const { data, error } = await admin
    .from('incentive_categories')
    .select('id, name, color, calc_type, percent, fixed_amount, active')
    .eq('profile_id', profileId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as CategoryRow[]).map(rowToCategory);
}

export interface NewCategory {
  profileId: string;
  name: string;
  color: string;
  calcType: IncentiveCalcType;
  percent: number | null;
  fixedAmount: number | null;
  sortOrder: number;
}

export async function createCategory(admin: SupabaseClient, input: NewCategory): Promise<void> {
  const { error } = await admin.from('incentive_categories').insert({
    profile_id: input.profileId,
    name: input.name,
    color: input.color,
    calc_type: input.calcType,
    percent: input.percent,
    fixed_amount: input.fixedAmount,
    sort_order: input.sortOrder,
  });
  if (error) throw error;
}

export async function updateCategory(
  admin: SupabaseClient,
  id: string,
  patch: Partial<{ name: string; color: string; calcType: IncentiveCalcType; percent: number | null; fixedAmount: number | null; active: boolean; sortOrder: number }>
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.calcType !== undefined) row.calc_type = patch.calcType;
  if (patch.percent !== undefined) row.percent = patch.percent;
  if (patch.fixedAmount !== undefined) row.fixed_amount = patch.fixedAmount;
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  const { error } = await admin.from('incentive_categories').update(row).eq('id', id);
  if (error) throw error;
}

// 이미 입력된 건(incentive_entries)이 이 항목을 참조 중이면 on delete restrict로 막히므로,
// 화면에서는 "삭제" 대신 active=false(비활성화)를 기본으로 쓴다. 참조가 없을 때만 실제 삭제.
export async function deleteCategory(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin.from('incentive_categories').delete().eq('id', id);
  if (error) throw error;
}

interface EntryRow {
  id: string;
  category_id: string;
  entry_date: string;
  patient_name: string;
  amount: number;
  note: string | null;
}

function rowToEntry(r: EntryRow): IncentiveEntry {
  return {
    id: r.id,
    categoryId: r.category_id,
    entryDate: r.entry_date,
    patientName: r.patient_name,
    amount: Number(r.amount),
    note: r.note ?? '',
  };
}

export async function listEntries(admin: SupabaseClient, profileId: string, month?: string): Promise<IncentiveEntry[]> {
  let query = admin
    .from('incentive_entries')
    .select('id, category_id, entry_date, patient_name, amount, note')
    .eq('profile_id', profileId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (month) query = query.gte('entry_date', `${month}-01`).lt('entry_date', nextMonthFirstDay(month));
  const { data, error } = await query;
  if (error) throw error;
  return (data as EntryRow[]).map(rowToEntry);
}

export interface NewEntry {
  profileId: string;
  categoryId: string;
  entryDate: string;
  patientName: string;
  amount: number;
  note: string;
  createdBy: string | null;
}

export async function createEntry(admin: SupabaseClient, input: NewEntry): Promise<void> {
  const { error } = await admin.from('incentive_entries').insert({
    profile_id: input.profileId,
    category_id: input.categoryId,
    entry_date: input.entryDate,
    patient_name: input.patientName,
    amount: input.amount,
    note: input.note || null,
    created_by: input.createdBy,
  });
  if (error) throw error;
}

export async function deleteEntry(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin.from('incentive_entries').delete().eq('id', id);
  if (error) throw error;
}

// "진료 실적 입력" 화면(전 직원 공용)이 쓰는 목록 — 금액/비율을 절대 담지 않는다.
export interface EntryOption {
  profileId: string;
  doctorName: string;
  categories: { id: string; name: string; color: string; needsAmount: boolean }[];
}

export async function listEntryOptionsForStaff(admin: SupabaseClient): Promise<EntryOption[]> {
  const profiles = await listProfiles(admin);
  const active = profiles.filter((p) => p.active);
  const options: EntryOption[] = [];
  for (const p of active) {
    const categories = await listCategories(admin, p.id);
    options.push({
      profileId: p.id,
      doctorName: p.staffName,
      categories: categories
        .filter((c) => c.active)
        .map((c) => ({ id: c.id, name: c.name, color: c.color, needsAmount: c.calcType === 'percent_of_amount' })),
    });
  }
  return options;
}

// "진료 실적 입력" 화면이 보여주는 최근 내역 — 역시 금액까지는 괜찮지만(직원이 결제금액
// 자체는 이미 알고 있다) 계산된 인센티브 금액/비율은 절대 담지 않는다.
export interface StaffVisibleEntry {
  id: string;
  profileId: string;
  doctorName: string;
  entryDate: string;
  patientName: string;
  categoryName: string;
  amount: number;
  note: string;
}

export async function listRecentEntriesForStaff(admin: SupabaseClient, limit = 50): Promise<StaffVisibleEntry[]> {
  const { data, error } = await admin
    .from('incentive_entries')
    .select(
      'id, profile_id, entry_date, patient_name, amount, note, category:category_id(name), profile:profile_id(staff:staff_id(name))'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  interface Row {
    id: string;
    profile_id: string;
    entry_date: string;
    patient_name: string;
    amount: number;
    note: string | null;
    category: { name: string } | { name: string }[] | null;
    profile: { staff: { name: string } | { name: string }[] | null } | { staff: { name: string } | { name: string }[] | null }[] | null;
  }
  const rows = data as unknown as Row[];
  return rows.map((r) => {
    const category = Array.isArray(r.category) ? r.category[0] : r.category;
    const profile = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    return {
      id: r.id,
      profileId: r.profile_id,
      doctorName: staffNameOf(profile?.staff ?? null),
      entryDate: r.entry_date,
      patientName: r.patient_name,
      categoryName: category?.name ?? '',
      amount: Number(r.amount),
      note: r.note ?? '',
    };
  });
}
