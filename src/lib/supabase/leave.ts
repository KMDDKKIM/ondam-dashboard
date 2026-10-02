import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeaveKind } from '@/lib/leave';

// 이 파일의 함수는 RLS가 적용되는 일반 로그인 클라이언트로 호출한다(인센티브와 다르게
// admin 클라이언트가 필요 없다) — 휴가 달력은 승인된 직원 전체가 서로 볼 수 있어야 하고,
// 승인/거절·조정 같은 민감한 쓰기는 migration_leave.sql의 RLS 정책이 막아 준다.

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName: string;
  startDate: string;
  endDate: string;
  halfDay: 'am' | 'pm' | null;
  kind: LeaveKind;
  status: LeaveStatus;
  memo: string;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface RequestRow {
  id: string;
  staff_id: string;
  start_date: string;
  end_date: string;
  half_day: 'am' | 'pm' | null;
  kind: LeaveKind;
  status: LeaveStatus;
  memo: string | null;
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  staff: { name: string } | { name: string }[] | null;
}

function staffNameOf(staff: RequestRow['staff']): string {
  if (!staff) return '';
  return Array.isArray(staff) ? (staff[0]?.name ?? '') : staff.name;
}

function rowToRequest(r: RequestRow): LeaveRequest {
  return {
    id: r.id,
    staffId: r.staff_id,
    staffName: staffNameOf(r.staff),
    startDate: r.start_date,
    endDate: r.end_date,
    halfDay: r.half_day,
    kind: r.kind,
    status: r.status,
    memo: r.memo ?? '',
    requestedBy: r.requested_by,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
  };
}

const SELECT_WITH_STAFF = 'id, staff_id, start_date, end_date, half_day, kind, status, memo, requested_by, decided_by, decided_at, created_at, staff:staff_id(name)';

export interface ListLeaveRequestsOptions {
  /** [from, to] 기간과 겹치는 신청만(달력용 월 단위 조회). */
  range?: { from: string; to: string };
  staffId?: string;
  status?: LeaveStatus;
}

// RLS가 "승인된 직원이면 전부 읽기 허용"이라 staffId를 안 주면 본인 것만이 아니라 팀
// 전체가 보인다(달력용). staffId/status를 주면 "내 잔여일수 계산용 전체 승인 내역"이나
// "원장의 전체 대기 목록" 같은 범위 없는 조회도 같은 함수로 할 수 있다.
export async function listLeaveRequests(
  supabase: SupabaseClient,
  options: ListLeaveRequestsOptions = {}
): Promise<LeaveRequest[]> {
  let query = supabase.from('leave_requests').select(SELECT_WITH_STAFF).order('start_date', { ascending: true });
  if (options.range) query = query.lte('start_date', options.range.to).gte('end_date', options.range.from);
  if (options.staffId) query = query.eq('staff_id', options.staffId);
  if (options.status) query = query.eq('status', options.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as RequestRow[]).map(rowToRequest);
}

export interface NewLeaveRequest {
  staffId: string;
  startDate: string;
  endDate: string;
  halfDay: 'am' | 'pm' | null;
  kind: LeaveKind;
  memo: string;
  requestedBy: string | null;
}

export async function createLeaveRequest(supabase: SupabaseClient, input: NewLeaveRequest): Promise<void> {
  const { error } = await supabase.from('leave_requests').insert({
    staff_id: input.staffId,
    start_date: input.startDate,
    end_date: input.endDate,
    half_day: input.halfDay,
    kind: input.kind,
    memo: input.memo || null,
    requested_by: input.requestedBy,
  });
  if (error) throw error;
}

// 원장 전용(RLS가 강제) — 승인/거절.
export async function decideLeaveRequest(
  supabase: SupabaseClient,
  id: string,
  status: 'approved' | 'rejected',
  decidedBy: string | null
): Promise<void> {
  const { error } = await supabase
    .from('leave_requests')
    .update({ status, decided_by: decidedBy, decided_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// 본인의 아직 결정 안 난 신청을 취소하거나(RLS가 본인+pending만 허용), 원장이 아무거나 지운다.
export async function cancelLeaveRequest(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.from('leave_requests').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('취소할 수 없습니다.');
}

export interface LeaveAdjustment {
  id: string;
  staffId: string;
  kind: LeaveKind;
  days: number;
  reason: string;
  createdAt: string;
}

interface AdjustmentRow {
  id: string;
  staff_id: string;
  kind: LeaveKind;
  days: number;
  reason: string | null;
  created_at: string;
}

function rowToAdjustment(r: AdjustmentRow): LeaveAdjustment {
  return { id: r.id, staffId: r.staff_id, kind: r.kind, days: Number(r.days), reason: r.reason ?? '', createdAt: r.created_at };
}

// staffId를 주면 그 사람 것만(원장이 특정 직원 내역을 볼 때), 안 주면 RLS가 걸러준 대로
// (본인은 자기 것만, 원장은 전체) 받는다.
export async function listAdjustments(supabase: SupabaseClient, staffId?: string): Promise<LeaveAdjustment[]> {
  let query = supabase.from('leave_adjustments').select('id, staff_id, kind, days, reason, created_at').order('created_at', { ascending: false });
  if (staffId) query = query.eq('staff_id', staffId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as AdjustmentRow[]).map(rowToAdjustment);
}

export interface NewAdjustment {
  staffId: string;
  kind: LeaveKind;
  days: number;
  reason: string;
  createdBy: string | null;
}

// 원장 전용(RLS가 강제) — 직원별 수동 추가/차감.
export async function createAdjustment(supabase: SupabaseClient, input: NewAdjustment): Promise<void> {
  const { error } = await supabase.from('leave_adjustments').insert({
    staff_id: input.staffId,
    kind: input.kind,
    days: input.days,
    reason: input.reason || null,
    created_by: input.createdBy,
  });
  if (error) throw error;
}
