import type { SupabaseClient } from '@supabase/supabase-js';
import type { HerbQueueDraft, HerbQueueItem, HerbQueueStatus } from '@/lib/herbQueue';

interface Row {
  id: string;
  patient_name: string;
  chart_no: string;
  doctor_name: string;
  herb_desc: string;
  note: string;
  status: HerbQueueStatus;
  requested_by_name: string;
  created_at: string;
  done_by_name: string;
  done_at: string | null;
}

function rowToItem(r: Row): HerbQueueItem {
  return {
    id: r.id,
    patientName: r.patient_name,
    chartNo: r.chart_no,
    doctorName: r.doctor_name,
    herbDesc: r.herb_desc,
    note: r.note,
    status: r.status,
    requestedByName: r.requested_by_name,
    createdAt: r.created_at,
    doneByName: r.done_by_name,
    doneAt: r.done_at,
  };
}

/** 대기 중인 신청 전부 + 최근 며칠 안에 완료한 신청. */
export async function listHerbQueue(supabase: SupabaseClient, doneSinceIso: string): Promise<{ waiting: HerbQueueItem[]; done: HerbQueueItem[] }> {
  const [waiting, done] = await Promise.all([
    supabase.from('herb_queue').select('*').eq('status', 'waiting').order('created_at', { ascending: true }),
    supabase.from('herb_queue').select('*').eq('status', 'done').gte('done_at', doneSinceIso).order('done_at', { ascending: false }).limit(200),
  ]);
  if (waiting.error) throw waiting.error;
  if (done.error) throw done.error;
  return {
    waiting: ((waiting.data ?? []) as Row[]).map(rowToItem),
    done: ((done.data ?? []) as Row[]).map(rowToItem),
  };
}

/** 지금 로그인한 직원의 (id, 이름). 이름을 못 찾으면 이름은 빈 글자. */
export async function currentStaff(supabase: SupabaseClient): Promise<{ id: string | null; name: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { id: null, name: '' };
  const { data } = await supabase.from('staff').select('name').eq('id', user.id).maybeSingle();
  return { id: user.id, name: (data as { name?: string } | null)?.name ?? '' };
}

export async function createHerbQueueItem(
  supabase: SupabaseClient,
  draft: HerbQueueDraft,
  requester: { id: string | null; name: string }
): Promise<HerbQueueItem> {
  const { data, error } = await supabase
    .from('herb_queue')
    .insert({
      patient_name: draft.patientName.trim(),
      chart_no: draft.chartNo.trim(),
      doctor_name: draft.doctorName.trim(),
      herb_desc: draft.herbDesc.trim(),
      note: draft.note.trim(),
      requested_by: requester.id,
      requested_by_name: requester.name,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToItem(data as Row);
}

export type HerbQueueEdit = Partial<HerbQueueDraft>;

// RLS가 막으면 오류 없이 0행이 바뀌므로 실제로 바뀌었는지 확인한다.
export async function updateHerbQueueItem(supabase: SupabaseClient, id: string, edit: HerbQueueEdit): Promise<void> {
  const db: Record<string, string> = {};
  if (edit.patientName !== undefined) db.patient_name = edit.patientName.trim();
  if (edit.chartNo !== undefined) db.chart_no = edit.chartNo.trim();
  if (edit.doctorName !== undefined) db.doctor_name = edit.doctorName.trim();
  if (edit.herbDesc !== undefined) db.herb_desc = edit.herbDesc.trim();
  if (edit.note !== undefined) db.note = edit.note.trim();
  const { data, error } = await supabase.from('herb_queue').update(db).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('저장하지 못했어요.');
}

export async function markHerbQueueDone(supabase: SupabaseClient, id: string, by: { id: string | null; name: string }): Promise<string> {
  const doneAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('herb_queue')
    .update({ status: 'done', done_by: by.id, done_by_name: by.name, done_at: doneAt })
    .eq('id', id)
    .eq('status', 'waiting') // 다른 사람이 먼저 완료했다면 바꾸지 않는다
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('이미 처리된 신청이에요.');
  return doneAt;
}

export async function undoHerbQueueDone(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase
    .from('herb_queue')
    .update({ status: 'waiting', done_by: null, done_by_name: '', done_at: null })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('되돌리지 못했어요.');
}

export async function deleteHerbQueueItem(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('herb_queue').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('지우지 못했어요.');
}

/** 대기 중인 신청 수(홈·메뉴 배지). doctorName 을 주면 그 진료의로 신청된 대기 건만, 주지 않으면(또는 null) 전체 대기 건수. 조회에 실패하면 null. */
export async function countWaitingHerbQueue(supabase: SupabaseClient, doctorName?: string | null): Promise<number | null> {
  try {
    let query = supabase.from('herb_queue').select('id', { count: 'exact', head: true }).eq('status', 'waiting');
    if (doctorName) query = query.eq('doctor_name', doctorName);
    const { count, error } = await query;
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}
