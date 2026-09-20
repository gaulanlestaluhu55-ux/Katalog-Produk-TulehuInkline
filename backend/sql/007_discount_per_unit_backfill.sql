-- TULEHU INKLINE - 007_discount_per_unit_backfill
-- Correct legacy nominal-discount totals to the per-pcs semantics.
-- No schema change: discount_type and discount_value from 005 remain in use.
-- Only rows whose stored total exactly matches the old formula are updated.
-- Orders whose recorded payment would exceed the corrected total are left untouched.

with candidates as (
  select
    id,
    (harga_satuan - discount_value) * qty as corrected_total
  from public.orders
  where status <> 'Batal'
    and discount_type = 'nominal'
    and discount_value > 0
    and discount_value <= harga_satuan
    and abs(total - ((harga_satuan * qty) - discount_value)) <= 0.01
    and nominal_dibayar <= ((harga_satuan - discount_value) * qty)
)
update public.orders as o
set
  total = c.corrected_total,
  sisa = c.corrected_total - o.nominal_dibayar,
  status_bayar = case
    when c.corrected_total <= 0 then 'Lunas'
    when o.nominal_dibayar <= 0 then 'Belum Bayar'
    when o.nominal_dibayar >= c.corrected_total then 'Lunas'
    else 'DP'
  end
from candidates as c
where o.id = c.id;

-- Verification: corrected rows should satisfy the per-pcs formula.
-- select id, harga_satuan, qty, discount_value, total,
--   (harga_satuan - discount_value) * qty as expected_total
-- from public.orders
-- where discount_type = 'nominal' and discount_value > 0
-- order by created_at desc;
--
-- Review skipped legacy rows before correcting their payments manually.
-- select id, harga_satuan, qty, discount_value, total, nominal_dibayar,
--   (harga_satuan - discount_value) * qty as corrected_total
-- from public.orders
-- where status <> 'Batal'
--   and discount_type = 'nominal'
--   and discount_value > 0
--   and abs(total - ((harga_satuan * qty) - discount_value)) <= 0.01
--   and nominal_dibayar > ((harga_satuan - discount_value) * qty);
