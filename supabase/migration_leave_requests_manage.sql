-- 확정된 연차/월차도 취소·변경할 수 있게 한다(원장 요청, 2026-10-02). 여러 번 실행해도 안전하다.
--  * 취소(삭제): 본인은 결정 상태와 상관없이 자기 신청을 지울 수 있다(원장은 기존대로 전부).
--  * 변경(수정): 본인은 자기 신청을 고칠 수 있지만, 고친 결과는 반드시 "승인 대기(pending)"여야 한다
--    — 스스로 승인 상태로 만들 수 없다(with check). 원장은 기존 "owner can update" 정책으로 그대로 가능.

drop policy if exists "own pending or owner can delete leave_requests" on leave_requests;
drop policy if exists "own or owner can delete leave_requests" on leave_requests;
create policy "own or owner can delete leave_requests" on leave_requests
  for delete to authenticated using (
    staff_id = auth.uid() or requested_by = auth.uid() or public.is_owner()
  );

drop policy if exists "own can re-request leave_requests" on leave_requests;
create policy "own can re-request leave_requests" on leave_requests
  for update to authenticated
  using (staff_id = auth.uid())
  with check (staff_id = auth.uid() and status = 'pending');
