-- 할 일·요청전달사항에 마감기한 추가(원장 요청, 2026-10-03). due_date는 달력에서 올린 날짜(어느 날 칸에 놓이는지)이고,
-- deadline이 마감기한이다(없을 수 있다). 마감기한은 보낸 사람(올린 사람)만 고칠 수 있다.

alter table work_items add column if not exists deadline date;

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
    raise exception '완료·확인 표시는 받은 사람만 할 수 있어요';
  end if;
  if (new.content is distinct from old.content or new.due_date is distinct from old.due_date or new.deadline is distinct from old.deadline)
     and auth.uid() <> old.created_by then
    raise exception '내용·마감기한 수정은 보낸 사람만 할 수 있어요';
  end if;
  return new;
end;
$$;
