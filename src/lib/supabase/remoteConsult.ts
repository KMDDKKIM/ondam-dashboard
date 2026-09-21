import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnswerItem, RemoteStatus } from '@/lib/remoteConsult';

export interface RemoteConsultRequest {
  id: string;
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
    .select('id, submitted_at, patient_name, phone, address, rrn_prefix, service, answers, status, handled_by, handled_at, memo')
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
