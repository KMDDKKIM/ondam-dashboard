-- 연차/월차가 이제 입사일 자동계산 없이 leave_adjustments(부여·조정)만으로 정해져서,
-- 잘못 입력했을 때 원장이 지울 수 있는 delete 정책이 필요하다. 여러 번 실행해도 안전하다.

drop policy if exists "owner can delete leave_adjustments" on leave_adjustments;
create policy "owner can delete leave_adjustments" on leave_adjustments
  for delete to authenticated using (public.is_owner());
