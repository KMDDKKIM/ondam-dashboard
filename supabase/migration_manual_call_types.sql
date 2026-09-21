-- 해피콜 목록에 직접 추가하는 콜, 그리고 비급여 구매에서 자동으로 만드는 콜에 "종류"와 "연락처"를 붙인다.
-- 종류: 초진 / 한약 / 린다이어트 / 비급여 / 기타 (목록의 "유형" 칸에 그대로 나온다). 옛 콜은 비어 있어 "비급여/수동"으로 보인다.
-- 여러 번 실행해도 안전하다.

alter table happy_call_manual_entries add column if not exists call_type text;
alter table happy_call_manual_entries add column if not exists phone text;

alter table happy_call_manual_entries drop constraint if exists happy_call_manual_entries_call_type_check;
alter table happy_call_manual_entries
  add constraint happy_call_manual_entries_call_type_check
  check (call_type is null or call_type in ('초진', '한약', '린다이어트', '비급여', '기타'));
