-- 한약재 재고 화면 "부족한 약재" 칸에 붙는 발주 메모 한 장(원장 요청, 2026-09-23):
-- "다음 주문 때 같이 시킬 약재"를 자유롭게 적어두는 공간. 모든 직원이 같이 보고 고치는
-- 메모 한 장이라 표를 만들지 않고 텍스트 한 줄(싱글턴 행)로 둔다. 이 파일은 여러 번 실행해도 안전하다.

create table if not exists herb_order_memo (
  id boolean primary key default true,
  text text not null default '',
  updated_by uuid references staff(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint herb_order_memo_singleton check (id)
);

insert into herb_order_memo (id, text)
values (true, '')
on conflict (id) do nothing;

alter table herb_order_memo enable row level security;

drop policy if exists "authenticated can read herb_order_memo" on herb_order_memo;
create policy "authenticated can read herb_order_memo" on herb_order_memo
  for select to authenticated using (public.is_approved_staff());

drop policy if exists "authenticated can update herb_order_memo" on herb_order_memo;
create policy "authenticated can update herb_order_memo" on herb_order_memo
  for update to authenticated using (public.is_approved_staff()) with check (public.is_approved_staff());

revoke all on herb_order_memo from anon;
