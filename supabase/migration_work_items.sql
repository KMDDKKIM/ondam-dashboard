-- 홈 화면 "할 일·전달사항"(원장 요청, 2026-10-03):
--  - self   : 내가 해야 할 일 — 본인만 보고 완료만 누르면 된다.
--  - order  : 다른 직원에게 하는 오더 — 받은 사람이 "완료"하면 보낸 사람도 완료한 것을 본다.
--  - notice : 전달사항 — 받은 사람이 "숙지"하면 보낸 사람도 숙지한 것을 본다.
-- 보낸 사람과 받은 사람만 볼 수 있다(원장도 남의 것은 못 본다). 직원 한 명당 한 줄이라, 여러 명에게 보내면 사람 수만큼 줄이 생긴다.

create table if not exists work_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('self', 'order', 'notice')),
  content text not null,
  created_by uuid not null references staff(id) on delete cascade,
  assignee_id uuid not null references staff(id) on delete cascade,
  due_date date,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind <> 'self' or created_by = assignee_id)
);

create index if not exists work_items_assignee_idx on work_items (assignee_id, done_at);
create index if not exists work_items_created_by_idx on work_items (created_by, done_at);

alter table work_items enable row level security;

drop policy if exists "parties can read work_items" on work_items;
create policy "parties can read work_items" on work_items
  for select to authenticated
  using (public.is_approved_staff() and (created_by = auth.uid() or assignee_id = auth.uid()));

-- 보낸 사람 이름으로만 만들 수 있고, 내 할 일(self)은 나에게만.
drop policy if exists "approved staff can insert work_items" on work_items;
create policy "approved staff can insert work_items" on work_items
  for insert to authenticated
  with check (public.is_approved_staff() and created_by = auth.uid());

drop policy if exists "parties can update work_items" on work_items;
create policy "parties can update work_items" on work_items
  for update to authenticated
  using (public.is_approved_staff() and (created_by = auth.uid() or assignee_id = auth.uid()));

drop policy if exists "sender can delete work_items" on work_items;
create policy "sender can delete work_items" on work_items
  for delete to authenticated
  using (public.is_approved_staff() and created_by = auth.uid());

-- 완료·숙지 표시는 받은 사람만, 내용·마감일 수정은 보낸 사람만. 보낸 사람·받은 사람·종류는 바꿀 수 없다.
create or replace function public.work_items_guard() returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    return new; -- 서버(service role)에서 직접 고치는 경우
  end if;
  if new.created_by is distinct from old.created_by
     or new.assignee_id is distinct from old.assignee_id
     or new.kind is distinct from old.kind then
    raise exception '보낸 사람·받은 사람·종류는 바꿀 수 없어요';
  end if;
  if new.done_at is distinct from old.done_at and auth.uid() <> old.assignee_id then
    raise exception '완료·숙지 표시는 받은 사람만 할 수 있어요';
  end if;
  if (new.content is distinct from old.content or new.due_date is distinct from old.due_date) and auth.uid() <> old.created_by then
    raise exception '내용 수정은 보낸 사람만 할 수 있어요';
  end if;
  return new;
end;
$$;

drop trigger if exists work_items_guard on work_items;
create trigger work_items_guard before update on work_items
  for each row execute function public.work_items_guard();
