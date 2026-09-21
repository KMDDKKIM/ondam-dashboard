import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConsultSummary } from '@/lib/types';

// 상담 기록은 10년 보관한다. 이 표에는 삭제(delete) 기능도, 오래된 기록을 지우는 자동 정리도 만들지 않는다.
// 저장된 원문·요약은 화면에서 읽기만 한다(고치거나 지우는 화면 없음). 직원 계정을 지워도 기록은 남는다
// (created_by 는 on delete set null). README 의 "상담 기록은 10년 보관" 참고.

interface ConsultSummaryRow {
  id: string;
  patient_name: string;
  consult_date: string;
  transcript: string;
  summary: string;
  created_by: string | null;
  created_at: string;
}

function rowToSummary(row: ConsultSummaryRow): ConsultSummary {
  return {
    id: row.id,
    patientName: row.patient_name,
    consultDate: row.consult_date,
    transcript: row.transcript,
    summary: row.summary,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listConsultSummaries(supabase: SupabaseClient): Promise<ConsultSummary[]> {
  const { data, error } = await supabase
    .from('consult_summaries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as ConsultSummaryRow[]).map(rowToSummary);
}

export interface NewConsultSummary {
  patientName: string;
  consultDate: string;
  transcript: string;
  summary: string;
  createdBy: string | null;
}

export async function createConsultSummary(
  supabase: SupabaseClient,
  input: NewConsultSummary
): Promise<ConsultSummary> {
  const { data, error } = await supabase
    .from('consult_summaries')
    .insert({
      patient_name: input.patientName,
      consult_date: input.consultDate,
      transcript: input.transcript,
      summary: input.summary,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToSummary(data as ConsultSummaryRow);
}
