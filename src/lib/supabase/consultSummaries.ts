import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConsultSummary } from '@/lib/types';

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

export async function updateConsultSummary(supabase: SupabaseClient, id: string, summary: string): Promise<void> {
  const { error } = await supabase.from('consult_summaries').update({ summary }).eq('id', id);
  if (error) throw error;
}
