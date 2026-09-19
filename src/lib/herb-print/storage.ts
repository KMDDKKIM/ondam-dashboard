import { createClient } from "@/lib/supabase/client";
import type { DoctorName, Dose, DoseMode, Prescription, Temperature } from "./types";

// 로그인한 직원 세션으로 접근한다(prescriptions 테이블 RLS는 로그인 사용자 전체 허용).
const supabase = { from: (table: string) => createClient().from(table) };

interface PrescriptionRow {
  id: string;
  created_at: string;
  updated_at: string;
  doctor_name: string;
  patient_name: string;
  chief_complaint: string;
  doses_per_day: number;
  dose_mode: string;
  doses: Dose[];
  temperature: string;
  brew_date: string | null;
  restricted_foods: string[];
  restricted_foods_other: string;
  storage_note: string;
  etc_note: string;
  personal_note: string;
}

function fromRow(row: PrescriptionRow): Prescription {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    doctorName: row.doctor_name as DoctorName,
    patientName: row.patient_name,
    chiefComplaint: row.chief_complaint,
    dosesPerDay: row.doses_per_day as 2 | 3,
    doseMode: row.dose_mode as DoseMode,
    doses: row.doses,
    temperature: row.temperature as Temperature,
    brewDate: row.brew_date ?? "",
    restrictedFoods: row.restricted_foods,
    restrictedFoodsOther: row.restricted_foods_other,
    storageNote: row.storage_note,
    etcNote: row.etc_note,
    personalNote: row.personal_note,
  };
}

function toRow(p: Prescription): PrescriptionRow {
  return {
    id: p.id,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    doctor_name: p.doctorName,
    patient_name: p.patientName,
    chief_complaint: p.chiefComplaint,
    doses_per_day: p.dosesPerDay,
    dose_mode: p.doseMode,
    doses: p.doses,
    temperature: p.temperature,
    brew_date: p.brewDate || null,
    restricted_foods: p.restrictedFoods,
    restricted_foods_other: p.restrictedFoodsOther,
    storage_note: p.storageNote,
    etc_note: p.etcNote,
    personal_note: p.personalNote,
  };
}

export async function getAll(): Promise<Prescription[]> {
  const { data, error } = await supabase
    .from("prescriptions")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as PrescriptionRow[]).map(fromRow);
}

export async function get(id: string): Promise<Prescription | undefined> {
  const { data, error } = await supabase
    .from("prescriptions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data as PrescriptionRow) : undefined;
}

export async function save(record: Prescription): Promise<Prescription> {
  const { data, error } = await supabase
    .from("prescriptions")
    .upsert(toRow(record))
    .select()
    .single();
  if (error) throw error;
  return fromRow(data as PrescriptionRow);
}

export async function remove(id: string): Promise<void> {
  const { error } = await supabase.from("prescriptions").delete().eq("id", id);
  if (error) throw error;
}

export function createId(): string {
  return `rx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
