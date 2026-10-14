-- 린다이어트 해피콜 정리(원장 요청, 2026-10-14): 새 기준을 정할 때까지 린다이어트 해피콜을 없앤다.
-- 아직 끝나지 않은 콜(done = false)만 지운다 — 이미 통화한 기록은 남긴다. 한 트랜잭션이라 중간에 막히면 전부 취소된다.
-- 코드도 더 이상 린다이어트 구매에서 해피콜을 만들지 않는다(src/lib/nonCoveredCalls.ts).

begin;

-- 미리 보기(실행 결과에서 지워질 건수를 확인할 수 있다)
select 'manual 린다이어트 열린 콜' as what, count(*) from happy_call_manual_entries where call_type = '린다이어트' and done = false
union all
select '린다이어트 패키지 열린 콜', count(*) from diet_package_calls where done = false;

-- 비급여 구매가 이 콜들을 가리키고 있으면 연결부터 푼다.
update non_covered_purchases set happy_call_entry_id = null
  where happy_call_entry_id in (select id from happy_call_manual_entries where call_type = '린다이어트' and done = false);
update non_covered_purchases set happy_call_entry_id_2 = null
  where happy_call_entry_id_2 in (select id from happy_call_manual_entries where call_type = '린다이어트' and done = false);
update non_covered_purchases set happy_call_entry_id_3 = null
  where happy_call_entry_id_3 in (select id from happy_call_manual_entries where call_type = '린다이어트' and done = false);

delete from happy_call_manual_entries where call_type = '린다이어트' and done = false;
delete from diet_package_calls where done = false;

commit;
