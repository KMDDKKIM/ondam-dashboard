-- 직원 삭제(퇴사/가입 거절) 지원.
-- staff 행을 지워도 그 직원이 남긴 기록(환자·처방·결산·상담요약·채팅·신청 등)은
-- 그대로 두고 "누가 했는지"만 비운다. staff(id)를 가리키는 외래키를 모두
-- on delete set null 로 다시 만든다. (chat_room_members.staff_id 는 on delete
-- cascade 그대로 — 채팅방 참여 정보만 같이 지워진다.)
--
-- 재실행해도 안전하다: 해당 컬럼의 staff 참조 외래키를 이름과 상관없이 찾아
-- 지운 뒤 <table>_<column>_fkey 이름으로 다시 만든다. 아직 없는 테이블은 건너뛴다.
do $$
declare
  targets text[][] := array[
    ['happy_call_patients', 'doctor_staff_id'],
    ['happy_call_patients', 'created_by'],
    ['herb_medicine_prescriptions', 'created_by'],
    ['diet_packages', 'created_by'],
    ['happy_call_manual_entries', 'created_by'],
    ['herb_inventory', 'created_by'],
    ['herb_inventory_logs', 'created_by'],
    ['non_covered_purchases', 'created_by'],
    ['daily_revenue', 'updated_by'],
    ['monthly_revenue_override', 'updated_by'],
    ['consult_summaries', 'created_by'],
    ['todos', 'assignee_staff_id'],
    ['todos', 'created_by'],
    ['chat_rooms', 'created_by'],
    ['chat_messages', 'sender_id'],
    ['supply_requests', 'requested_by'],
    ['supply_requests', 'ordered_by'],
    ['supply_requests', 'received_by']
  ];
  t text;
  c text;
  i int;
  con record;
begin
  for i in 1 .. array_length(targets, 1) loop
    t := targets[i][1];
    c := targets[i][2];
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    -- 이 컬럼에서 staff를 가리키는 기존 외래키(이름이 뭐든)를 모두 제거
    for con in
      select k.conname
      from pg_constraint k
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
      where k.contype = 'f'
        and k.conrelid = ('public.' || t)::regclass
        and k.confrelid = 'public.staff'::regclass
        and a.attname = c
    loop
      execute format('alter table public.%I drop constraint %I', t, con.conname);
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.staff(id) on delete set null',
      t, t || '_' || c || '_fkey', c
    );
  end loop;
end
$$;

-- 직원 이름은 로그인 아이디로 쓰이므로 중복을 DB가 막는다(가입 API의 사전 조회와
-- insert 사이에 같은 이름이 끼어드는 경우까지 방어). 이미 같은 이름이 둘 이상
-- 있으면 이 문장이 실패하니 먼저 정리한 뒤 실행한다.
create unique index if not exists staff_name_unique on staff (name);
