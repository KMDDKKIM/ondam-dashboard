-- 한약 해피콜을 처방전 기준으로(원장 결정, 2026-10-14):
-- 처방전을 출력하면(printed_at) 한약 대기방에 "수령예정일 입력 대기"가 뜨고, 데스크가 수령예정일(pickup_date)을 넣으면
-- 수령확인(수령예정일+2일)·중간상담(며칠분에 맞춘 날짜) 해피콜이 만들어진다. 그 해피콜을 처방전에 연결해 둔다(call_entry_id·call_entry_id_2).
-- 여러 번 실행해도 안전하다. 이미 저장된 처방전은 출력 기록이 없어 대기 목록에 뜨지 않는다.

alter table herb_compounding_orders add column if not exists printed_at timestamptz;
alter table herb_compounding_orders add column if not exists pickup_date date;
-- 수령예정일을 입력하지 않고 대기 목록에서 뺀 처방전(취소한 출력 등)
alter table herb_compounding_orders add column if not exists pickup_dismissed boolean not null default false;
alter table herb_compounding_orders add column if not exists call_entry_id uuid references happy_call_manual_entries(id) on delete set null;
alter table herb_compounding_orders add column if not exists call_entry_id_2 uuid references happy_call_manual_entries(id) on delete set null;

create index if not exists herb_compounding_orders_pickup_idx
  on herb_compounding_orders (printed_at)
  where pickup_date is null and pickup_dismissed = false;
