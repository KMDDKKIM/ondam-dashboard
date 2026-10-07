-- 한약 처방집(원장 요청, 2026-10-07): OK차트 처방집처럼 처방명을 검색해 한약 처방전의 약재 목록을 채운다.
-- 처방집은 이 표에 직접 쌓는다 — 한약 처방전 화면의 "처방집에 저장"이나 "붙여넣어 가져오기"로 넣는다.
-- 같은 처방명이라도 출전(source)이 다르면 따로 둔다(예: 사상의학 / 채움생). 승인된 직원이면 누구나 보고 고칠 수 있다.

create table if not exists herb_formulas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_hanja text not null default '',
  source text not null default '',
  herbs jsonb not null default '[]'::jsonb,
  memo text not null default '',
  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, source)
);

create index if not exists herb_formulas_name_idx on herb_formulas (name);

alter table herb_formulas enable row level security;

drop policy if exists "approved staff can read herb_formulas" on herb_formulas;
create policy "approved staff can read herb_formulas" on herb_formulas
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "approved staff can insert herb_formulas" on herb_formulas;
create policy "approved staff can insert herb_formulas" on herb_formulas
  for insert to authenticated with check (public.is_approved_staff());

drop policy if exists "approved staff can update herb_formulas" on herb_formulas;
create policy "approved staff can update herb_formulas" on herb_formulas
  for update to authenticated using (public.is_approved_staff());

drop policy if exists "approved staff can delete herb_formulas" on herb_formulas;
create policy "approved staff can delete herb_formulas" on herb_formulas
  for delete to authenticated using (public.is_approved_staff());
