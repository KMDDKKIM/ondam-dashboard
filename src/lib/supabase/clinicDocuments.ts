import type { SupabaseClient } from '@supabase/supabase-js';
import { storagePathFor } from '@/lib/clinicDocuments';

const BUCKET = 'clinic-documents';

export interface ClinicDocument {
  id: string;
  title: string;
  category: string;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  createdAt: string;
}

function toDocument(r: Record<string, unknown>): ClinicDocument {
  return {
    id: r.id as string,
    title: r.title as string,
    category: r.category as string,
    fileName: r.file_name as string,
    storagePath: r.storage_path as string,
    contentType: (r.content_type as string | null) ?? null,
    sizeBytes: (r.size_bytes as number | null) ?? null,
    uploadedBy: (r.uploaded_by as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export async function listDocuments(supabase: SupabaseClient): Promise<ClinicDocument[]> {
  const { data, error } = await supabase.from('clinic_documents').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toDocument);
}

/** 파일을 올리고 목록에 올린다. 목록 저장이 실패하면 방금 올린 파일은 지운다. */
export async function uploadDocument(
  supabase: SupabaseClient,
  input: { file: File; title: string; category: string; uploadedBy: string | null }
): Promise<ClinicDocument> {
  const id = crypto.randomUUID();
  const path = storagePathFor(id, input.file.name);
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, input.file, { contentType: input.file.type || undefined });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase
    .from('clinic_documents')
    .insert({
      id,
      title: input.title,
      category: input.category,
      file_name: input.file.name,
      storage_path: path,
      content_type: input.file.type || null,
      size_bytes: input.file.size,
      uploaded_by: input.uploadedBy,
    })
    .select('*')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return toDocument(data);
}

/** 잠깐(10분) 열리는 주소를 받는다. download 가 true 면 열지 않고 내려받는다. */
export async function documentUrl(supabase: SupabaseClient, doc: ClinicDocument, download: boolean): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storagePath, 600, download ? { download: doc.fileName } : undefined);
  if (error || !data) throw error ?? new Error('url failed');
  return data.signedUrl;
}

export async function deleteDocument(supabase: SupabaseClient, doc: ClinicDocument): Promise<void> {
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([doc.storagePath]);
  if (removeError) throw removeError;
  const { error } = await supabase.from('clinic_documents').delete().eq('id', doc.id);
  if (error) throw error;
}
