-- 비급여 구매를 지우거나 수령일/처방일수를 고치면 그 구매로 자동 생성된 해피콜(happy_call_manual_entries)
-- 도 지워야 한다. DELETE 정책이 없으면 Supabase는 에러 없이 0행만 지운다. (idempotent)
-- 앱은 이 정책이 아직 없어도 동작한다(지우지 못한 콜은 "취소됨"으로 닫는다) — 적용하면 실제로 지워진다.
drop policy if exists "authenticated can delete happy_call_manual_entries" on happy_call_manual_entries;
create policy "authenticated can delete happy_call_manual_entries" on happy_call_manual_entries
  for delete to authenticated using (public.is_approved_staff());
