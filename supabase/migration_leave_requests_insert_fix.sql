-- 보안 수정(2026-10-02): 직원이 API로 status='approved'를 직접 넣어 원장 승인 없이 연차를
-- 확정시킬 수 있었다(insert 정책이 "승인된 직원이면 누구나"만 확인). 이제 일반 직원은 "본인 명의의
-- 승인 대기(pending) 신청"만 만들 수 있고, 원장은 기존처럼 제한 없이 만들 수 있다.
-- 여러 번 실행해도 안전하다.

drop policy if exists "approved staff can insert leave_requests" on leave_requests;
create policy "approved staff can insert leave_requests" on leave_requests
  for insert to authenticated with check (
    public.is_approved_staff()
    and (
      (staff_id = auth.uid() and status = 'pending' and decided_by is null and decided_at is null)
      or public.is_owner()
    )
  );
