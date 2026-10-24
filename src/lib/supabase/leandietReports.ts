import type { SupabaseClient } from '@supabase/supabase-js';
import { followUpReason, type LeanPatient, type LeanReport, type LeanSummary } from '@/lib/leandietReport';
import { todayKst } from '@/lib/kst';
import { createManualEntry } from './happyCallQueue';

export interface StoredReport extends LeanReport {
  /** 대시보드가 리포트를 받은 시각(ISO) */
  receivedAt: string;
}

export interface Followup {
  id: string;
  leanPatientId: string;
  reportDate: string;
  target: 'desk' | 'owner';
  entryId: string | null;
  createdAt: string;
}

/** 가장 최근에 받은 리포트. 아직 한 번도 못 받았으면 null. */
export async function loadLatestReport(supabase: SupabaseClient): Promise<StoredReport | null> {
  const { data, error } = await supabase
    .from('leandiet_daily_reports')
    .select('report_date, base_date, generated_at, received_at, criteria, summary, payload')
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    reportDate: data.report_date as string,
    baseDate: (data.base_date as string | null) ?? null,
    generatedAt: (data.generated_at as string | null) ?? null,
    receivedAt: data.received_at as string,
    criteria: (data.criteria as string | null) ?? '',
    summary: data.summary as LeanSummary,
    patients: (data.payload as LeanPatient[]) ?? [],
  };
}

/** 이 날짜 이후에 만든 후속 연락 기록(보낸 곳 표시·중복 방지용). */
export async function loadFollowups(supabase: SupabaseClient, sinceDate: string): Promise<Followup[]> {
  const { data, error } = await supabase
    .from('leandiet_followups')
    .select('id, lean_patient_id, report_date, target, entry_id, created_at')
    .gte('report_date', sinceDate);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    leanPatientId: r.lean_patient_id as string,
    reportDate: r.report_date as string,
    target: r.target as 'desk' | 'owner',
    entryId: (r.entry_id as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/** 직원 해피콜 목록으로 보낸다 — 오늘 날짜의 "린다이어트" 수동 콜을 만들고 보낸 기록을 남긴다. 이미 보냈으면 false. */
export async function sendToDesk(supabase: SupabaseClient, patient: LeanPatient, reportDate: string, createdBy: string | null): Promise<boolean> {
  const reason = followUpReason(patient);
  const { data: existing } = await supabase
    .from('leandiet_followups')
    .select('id')
    .eq('lean_patient_id', patient.leanPatientId)
    .eq('report_date', reportDate)
    .eq('target', 'desk')
    .maybeSingle();
  if (existing) return false;
  const entryId = await createManualEntry(supabase, {
    patientName: patient.name,
    note: `린다이어트 · 기록 체크: ${reason}`,
    callDate: todayKst(),
    createdBy,
    callType: '린다이어트',
    phone: patient.phone || null,
  });
  const { error } = await supabase.from('leandiet_followups').insert({
    lean_patient_id: patient.leanPatientId,
    report_date: reportDate,
    target: 'desk',
    patient_name: patient.name,
    phone: patient.phone || null,
    reason,
    entry_id: entryId,
    created_by: createdBy,
  });
  if (error) throw error;
  return true;
}

/** 원장 케어 보드로 보낸다(서버 라우트가 대신 처리). 이미 보냈으면 false. */
export async function sendToOwnerBoard(patient: LeanPatient, reportDate: string): Promise<boolean> {
  const res = await fetch('/api/leandiet/send-to-care', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leanPatientId: patient.leanPatientId, reportDate, patientName: patient.name, phone: patient.phone, reason: followUpReason(patient) }),
  });
  if (!res.ok) throw new Error('send failed');
  const body = (await res.json()) as { action?: string };
  return body.action !== 'exists';
}
