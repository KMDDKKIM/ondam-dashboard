-- 자료실 — 2026-10-26 원장 요청. 복용법·접수증 같은 한의원 문서를 올려 두고 모든 직원이 열어 보는 공간.
-- 파일은 비공개 버킷 clinic-documents 에 두고(주소를 알아도 로그인한 승인 직원만 열 수 있다), 목록은 clinic_documents 표에 둔다.

create table if not exists clinic_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '기타',
  file_name text not null,
  storage_path text not null unique,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table clinic_documents enable row level security;

drop policy if exists "approved staff can read clinic_documents" on clinic_documents;
create policy "approved staff can read clinic_documents" on clinic_documents
  for select to authenticated using (public.is_approved_staff());
drop policy if exists "approved staff can insert clinic_documents" on clinic_documents;
create policy "approved staff can insert clinic_documents" on clinic_documents
  for insert to authenticated with check (public.is_approved_staff());
drop policy if exists "approved staff can delete clinic_documents" on clinic_documents;
create policy "approved staff can delete clinic_documents" on clinic_documents
  for delete to authenticated using (public.is_approved_staff());

-- 비공개 버킷(파일 하나 50MB까지)
insert into storage.buckets (id, name, public, file_size_limit)
values ('clinic-documents', 'clinic-documents', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "approved staff can upload clinic documents" on storage.objects;
create policy "approved staff can upload clinic documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'clinic-documents' and public.is_approved_staff());

drop policy if exists "approved staff can view clinic documents" on storage.objects;
create policy "approved staff can view clinic documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'clinic-documents' and public.is_approved_staff());

drop policy if exists "approved staff can delete clinic documents" on storage.objects;
create policy "approved staff can delete clinic documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clinic-documents' and public.is_approved_staff());
