-- TULEHU INKLINE - 005_order_discounts
-- Additive order-discount fields. discount_value is the raw discount per pcs.

alter table public.orders
  add column if not exists discount_type text not null default 'nominal',
  add column if not exists discount_value numeric not null default 0;

-- Verification: both values should be zero/default for legacy orders.
-- select discount_type, count(*), min(discount_value), max(discount_value)
-- from public.orders group by discount_type order by discount_type;
-- select id, harga_satuan, qty, total, discount_type, discount_value
-- from public.orders order by created_at desc limit 20;
