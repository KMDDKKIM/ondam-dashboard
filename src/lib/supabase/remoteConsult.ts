import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSource, type AnswerItem, type RemoteSource, type RemoteStatus } from '@/lib/remoteConsult';
import type { RemoteAlertItem } from '@/lib/remoteAlert';

export interface RemoteConsultRequest {
  id: string;
  source: RemoteSource;
  submittedAt: string;
  patientName: string;
  phone: string;
  address: string;
  rrnPrefix: string | null;
  service: string;
  answers: AnswerItem[];
  status: RemoteStatus;
  handledBy: string | null;
  handledAt: string | null;
  memo: string;
}

interface Row {
  id: string;
  source: string | null;
  submitted_at: string;
  patient_name: string;
  phone: string;
  address: string;
  rrn_prefix: string | null;
  service: string;
  answers: AnswerItem[] | null;
  status: RemoteStatus;
  handled_by: string | null;
  handled_at: string | null;
  memo: string;
}

function rowToRequest(r: Row): RemoteConsultRequest {
  return {
    id: r.id,
    source: normalizeSource(r.source),
    submittedAt: r.submitted_at,
    patientName: r.patient_name,
    phone: r.phone,
    address: r.address,
    rrnPrefix: r.rrn_prefix,
    service: r.service,
    answers: Array.isArray(r.answers) ? r.answers : [],
    status: r.status,
    handledBy: r.handled_by,
    handledAt: r.handled_at,
    memo: r.memo,
  };
}

export async function listRemoteConsultRequests(supabase: SupabaseClient, limit = 300): Promise<RemoteConsultRequest[]> {
  const { data, error } = await supabase
    .from('remote_consult_requests')
    .select('id, source, submitted_at, patient_name, phone, address, rrn_prefix, service, answers, status, handled_by, handled_at, memo')
    .order('submitted_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Row[]).map(rowToRequest);
}

// RLS가 막으면 에러 없이 0행이 바뀌므로 실제로 바뀌었는지 확인한다.
export async function setRemoteStatus(
  supabase: SupabaseClient,
  id: string,
  status: RemoteStatus,
  staffId: string | null
): Promise<void> {
  const { data, error } = await supabase
    .from('remote_consult_requests')
    .update({
      status,
      handled_by: status === 'new' ? null : staffId,
      handled_at: status === 'new' ? null : new Date().toISOString(),
    })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('상태를 바꾸지 못했어요.');
}

export async function setRemoteMemo(supabase: SupabaseClient, id: string, memo: string): Promise<void> {
  const { data, error } = await supabase.from('remote_consult_requests').update({ memo }).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('메모를 저장하지 못했어요.');
}

/** 처리 대기(new) 건수 — 메뉴 배지와 홈 요약에 쓴다. 조회에 실패하면 null. */
export async function countNewRemoteRequests(supabase: SupabaseClient): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from('remote_consult_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

// ── 새 신청 알림(RemoteConsultAlerter)용 ──
// 알림에는 이름·진료·출처만 쓴다. 주민번호 앞자리(rrn_prefix)·연락처·주소는 일부러 읽지 않는다.
const ALERT_COLUMNS = 'id, source, patient_name, service, created_at';

interface AlertRow {
  id: string;
  source: string | null;
  patient_name: string;
  service: string;
  created_at: string;
}

function rowToAlert(r: AlertRow): RemoteAlertItem {
  return {
    id: r.id,
    source: normalizeSource(r.source),
    patientName: r.patient_name,
    service: r.service,
    createdAt: r.created_at,
  };
}

/** 실시간으로 id만 받은 새 신청의 알림용 정보. 못 읽으면(RLS·네트워크) null. */
export async function fetchRemoteAlertItem(supabase: SupabaseClient, id: string): Promise<RemoteAlertItem | null> {
  const { data, error } = await supabase.from('remote_consult_requests').select(ALERT_COLUMNS).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return rowToAlert(data as AlertRow);
}

/** 가장 최근에 들어온 신청의 created_at(DB 시각) — 실시간이 끊겼을 때 "이후에 들어온 것"을 가리는 기준. */
export async function latestRemoteCreatedAt(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('remote_consult_requests')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data as { created_at: string }[])[0]?.created_at ?? null;
}

/** sinceIso 이후에 들어온 대기(new) 신청, 오래된 순. */
export async function listNewRemoteAlertItemsSince(
  supabase: SupabaseClient,
  sinceIso: string | null,
  limit = 20
): Promise<RemoteAlertItem[]> {
  let query = supabase
    .from('remote_consult_requests')
    .select(ALERT_COLUMNS)
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (sinceIso) query = query.gt('created_at', sinceIso);
  const { data, error } = await query;
  if (error) throw error;
  return (data as AlertRow[]).map(rowToAlert);
}

// INSERT 가 올 때마다 새 행의 id만 넘긴다 — payload 의 나머지 칸(주민번호 앞자리 등)은 쓰지 않고,
// 호출자가 fetchRemoteAlertItem 으로 필요한 칸만 다시 읽는다. onStatus 로 채널 상태(SUBSCRIBED/CHANNEL_ERROR/
// TIMED_OUT/CLOSED)를 알려 줘서, 끊기면 호출자가 주기 확인으로 바꿀 수 있게 한다.
export function subscribeToNewRemoteRequests(
  supabase: SupabaseClient,
  onInsert: (id: string) => void,
  onStatus: (status: string) => void
): () => void {
  const channel = supabase
    .channel('remote_consult_requests:insert')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'remote_consult_requests' }, (payload) => {
      const id = (payload.new as { id?: unknown } | null)?.id;
      if (typeof id === 'string') onInsert(id);
    })
    .subscribe((status) => onStatus(status));

  return () => {
    supabase.removeChannel(channel);
  };
}
