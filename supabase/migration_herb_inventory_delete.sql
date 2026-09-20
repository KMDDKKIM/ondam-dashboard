-- 주의: 이 파일의 정책은 나중에 migration_rls_approved_only.sql 로 대체됨. 새 DB가 아니면 다시 실행하지 말 것.
-- 한약재 재고 화면에서 약재를 지울 수 있게 DELETE 정책을 추가한다.
-- (정책이 없으면 Supabase는 에러 없이 0행만 지운다.) 사용/입고 이력은
-- herb_inventory_logs의 on delete cascade로 같이 지워진다.
drop policy if exists "authenticated can delete herb_inventory" on herb_inventory;
create policy "authenticated can delete herb_inventory" on herb_inventory
  for delete using (auth.role() = 'authenticated');
