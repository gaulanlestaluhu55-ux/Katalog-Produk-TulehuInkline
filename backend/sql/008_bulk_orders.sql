-- TULEHU INKLINE - 008_bulk_orders
-- Additive foundation for one parent bulk order with variant matrix items and append-only payments.
-- Run manually in Supabase SQL Editor after migrations 001-007.

create table if not exists public.bulk_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  id_produk uuid references public.products(id) on delete set null,
  nama_produk text not null default '',
  kategori text not null default '',
  nama_customer text not null default '',
  kontak text not null default '',
  status text not null default 'Menunggu DP',
  status_bayar text not null default 'Belum Bayar',
  nominal_dibayar numeric not null default 0,
  sisa numeric not null default 0,
  subtotal numeric not null default 0,
  total_discount numeric not null default 0,
  total numeric not null default 0,
  cuttingan text not null default 'Reguler',
  tambahan_harga_per_pcs numeric not null default 0,
  catatan text not null default ''
);

create table if not exists public.bulk_order_items (
  id uuid primary key default gen_random_uuid(),
  bulk_order_id uuid not null references public.bulk_orders(id) on delete cascade,
  id_produk uuid references public.products(id) on delete set null,
  nama_produk text not null default '',
  kategori text not null default '',
  size text not null default '',
  warna text not null default '',
  lengan text not null default '',
  cuttingan text not null default 'Reguler',
  qty integer not null check (qty > 0),
  harga_satuan_normal numeric not null default 0,
  discount_type text not null default 'nominal' check (discount_type in ('nominal', 'percent')),
  discount_value numeric not null default 0,
  discount_per_unit numeric not null default 0,
  harga_satuan_final numeric not null default 0,
  subtotal numeric not null default 0,
  total_discount numeric not null default 0,
  total numeric not null default 0
);

create table if not exists public.bulk_order_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bulk_order_id uuid not null references public.bulk_orders(id) on delete cascade,
  nominal numeric not null,
  akun text not null default 'Kas',
  tipe text not null,
  keterangan text not null default '',
  void_of uuid references public.bulk_order_payments(id) on delete restrict
);

alter table public.finance_transactions
  add column if not exists bulk_order_id uuid references public.bulk_orders(id) on delete set null;

create index if not exists idx_bulk_orders_created_at on public.bulk_orders(created_at desc);
create index if not exists idx_bulk_orders_status on public.bulk_orders(status);
create index if not exists idx_bulk_order_items_parent on public.bulk_order_items(bulk_order_id);
create index if not exists idx_bulk_order_payments_parent on public.bulk_order_payments(bulk_order_id, created_at);
create index if not exists idx_finance_bulk_order on public.finance_transactions(bulk_order_id) where bulk_order_id is not null;

create or replace function public.create_bulk_order(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_paid numeric := greatest(0, coalesce((payload->>'nominal_dibayar')::numeric, 0));
  v_status_bayar text;
  v_status text := coalesce(nullif(payload->>'status', ''), 'Menunggu DP');
  v_item jsonb;
begin
  if coalesce(nullif(trim(payload->>'nama_customer'), ''), '') = '' then raise exception 'Nama customer wajib diisi.'; end if;
  if v_status not in ('Menunggu DP', 'Siap Produksi', 'Diproses', 'Selesai Produksi', 'Siap Diambil', 'Diambil', 'Batal') then raise exception 'Status pesanan massal tidak valid.'; end if;
  if jsonb_typeof(payload->'items') <> 'array' or jsonb_array_length(payload->'items') = 0 then raise exception 'Item pesanan massal wajib diisi.'; end if;

  for v_item in select value from jsonb_array_elements(payload->'items') loop
    if coalesce((v_item->>'qty')::integer, 0) <= 0 then raise exception 'Qty item harus lebih dari 0.'; end if;
    if coalesce((v_item->>'harga_satuan_final')::numeric, -1) < 0 then raise exception 'Harga final item tidak valid.'; end if;
    v_subtotal := v_subtotal + coalesce((v_item->>'subtotal')::numeric, 0);
    v_discount := v_discount + coalesce((v_item->>'total_discount')::numeric, 0);
    v_total := v_total + coalesce((v_item->>'total')::numeric, 0);
  end loop;
  if v_paid > v_total then raise exception 'Nominal dibayar tidak boleh lebih besar dari total pesanan.'; end if;
  v_status_bayar := case when v_total <= 0 or v_paid >= v_total then 'Lunas' when v_paid > 0 then 'DP' else 'Belum Bayar' end;

  insert into public.bulk_orders (id, id_produk, nama_produk, kategori, nama_customer, kontak, status, status_bayar, nominal_dibayar, sisa, subtotal, total_discount, total, cuttingan, tambahan_harga_per_pcs, catatan)
  values (v_order_id, nullif(payload->>'id_produk', '')::uuid, coalesce(payload->>'nama_produk', ''), coalesce(payload->>'kategori', ''), trim(payload->>'nama_customer'), coalesce(payload->>'kontak', ''), v_status, v_status_bayar, v_paid, v_total-v_paid, v_subtotal, v_discount, v_total, coalesce(payload->>'cuttingan', 'Reguler'), greatest(0, coalesce((payload->>'tambahan_harga_per_pcs')::numeric, 0)), coalesce(payload->>'catatan', ''));

  insert into public.bulk_order_items (bulk_order_id, id_produk, nama_produk, kategori, size, warna, lengan, cuttingan, qty, harga_satuan_normal, discount_type, discount_value, discount_per_unit, harga_satuan_final, subtotal, total_discount, total)
  select v_order_id, nullif(item->>'id_produk', '')::uuid, coalesce(item->>'nama_produk', ''), coalesce(item->>'kategori', ''), coalesce(item->>'size', ''), coalesce(item->>'warna', ''), coalesce(item->>'lengan', ''), coalesce(item->>'cuttingan', 'Reguler'), (item->>'qty')::integer, (item->>'harga_satuan_normal')::numeric, coalesce(item->>'discount_type', 'nominal'), coalesce((item->>'discount_value')::numeric, 0), coalesce((item->>'discount_per_unit')::numeric, 0), (item->>'harga_satuan_final')::numeric, (item->>'subtotal')::numeric, coalesce((item->>'total_discount')::numeric, 0), (item->>'total')::numeric
  from jsonb_array_elements(payload->'items') item;

  if v_paid > 0 then
    insert into public.bulk_order_payments (bulk_order_id, nominal, akun, tipe, keterangan)
    values (v_order_id, v_paid, trim(payload->>'akun'), case when v_paid >= v_total then 'Pelunasan' else 'DP' end, 'Pembayaran awal pesanan massal');
    insert into public.finance_transactions (tipe, sumber, bulk_order_id, kategori, keterangan, nominal, akun)
    values ('Masuk', 'Pesanan Massal', v_order_id, 'Pembayaran Pesanan', 'Pembayaran awal pesanan massal - ' || trim(payload->>'nama_customer'), v_paid, trim(payload->>'akun'));
  end if;
  return v_order_id;
end;
$$;

create or replace function public.append_bulk_order_payment(p_order_id uuid, p_nominal numeric, p_akun text, p_keterangan text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.bulk_orders%rowtype; v_paid numeric; v_sisa numeric; v_tipe text;
begin
  if p_nominal <= 0 then raise exception 'Nominal tambah harus lebih dari 0.'; end if;
  if coalesce(trim(p_akun), '') = '' then raise exception 'Akun wajib diisi.'; end if;
  select * into v_order from public.bulk_orders where id = p_order_id for update;
  if not found then raise exception 'Pesanan massal tidak ditemukan.'; end if;
  if v_order.status = 'Batal' then raise exception 'Pesanan batal tidak dapat menerima pembayaran.'; end if;
  v_paid := v_order.nominal_dibayar + p_nominal;
  if v_paid > v_order.total then raise exception 'Nominal melebihi sisa pembayaran.'; end if;
  v_sisa := v_order.total - v_paid;
  v_tipe := case when v_order.nominal_dibayar > 0 then 'Pelunasan' else 'DP' end;
  insert into public.bulk_order_payments (bulk_order_id, nominal, akun, tipe, keterangan) values (p_order_id, p_nominal, trim(p_akun), v_tipe, coalesce(p_keterangan, 'Pembayaran tambahan pesanan massal'));
  insert into public.finance_transactions (tipe, sumber, bulk_order_id, kategori, keterangan, nominal, akun) values ('Masuk', 'Pesanan Massal', p_order_id, 'Pembayaran Pesanan', coalesce(p_keterangan, 'Pembayaran tambahan pesanan massal'), p_nominal, trim(p_akun));
  update public.bulk_orders set nominal_dibayar = v_paid, sisa = v_sisa, status_bayar = case when v_paid >= total then 'Lunas' else 'DP' end where id = p_order_id;
  return jsonb_build_object('nominal_dibayar', v_paid, 'sisa', v_sisa, 'status_bayar', case when v_paid >= v_order.total then 'Lunas' else 'DP' end);
end;
$$;

create or replace function public.void_bulk_order_payment(p_order_id uuid, p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.bulk_orders%rowtype; v_payment public.bulk_order_payments%rowtype; v_paid numeric;
begin
  select * into v_order from public.bulk_orders where id = p_order_id for update;
  if not found then raise exception 'Pesanan massal tidak ditemukan.'; end if;
  select * into v_payment from public.bulk_order_payments where id = p_payment_id and bulk_order_id = p_order_id for update;
  if not found or v_payment.nominal <= 0 or v_payment.tipe not in ('DP', 'Pelunasan', 'Cicilan') then raise exception 'Baris pembayaran tidak dapat dikoreksi.'; end if;
  if exists (select 1 from public.bulk_order_payments where void_of = p_payment_id) then raise exception 'Baris ini sudah pernah dikoreksi.'; end if;
  v_paid := v_order.nominal_dibayar - v_payment.nominal;
  insert into public.bulk_order_payments (bulk_order_id, nominal, akun, tipe, keterangan, void_of) values (p_order_id, -v_payment.nominal, v_payment.akun, 'Koreksi', 'Koreksi void:' || p_payment_id::text, p_payment_id);
  insert into public.finance_transactions (tipe, sumber, bulk_order_id, kategori, keterangan, nominal, akun) values ('Keluar', 'Pesanan Massal', p_order_id, 'Koreksi Pembayaran', 'Koreksi void pembayaran pesanan massal', v_payment.nominal, v_payment.akun);
  update public.bulk_orders set nominal_dibayar = v_paid, sisa = total-v_paid, status_bayar = case when v_paid <= 0 then 'Belum Bayar' when v_paid >= total then 'Lunas' else 'DP' end where id = p_order_id;
  return jsonb_build_object('nominal_dibayar', v_paid, 'sisa', v_order.total-v_paid);
end;
$$;

create or replace function public.set_bulk_order_status(p_order_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order public.bulk_orders%rowtype; v_account record;
begin
  if p_status not in ('Menunggu DP', 'Siap Produksi', 'Diproses', 'Selesai Produksi', 'Siap Diambil', 'Diambil', 'Batal') then raise exception 'Status pesanan massal tidak valid.'; end if;
  select * into v_order from public.bulk_orders where id = p_order_id for update;
  if not found then raise exception 'Pesanan massal tidak ditemukan.'; end if;
  if p_status = 'Batal' and v_order.status <> 'Batal' then
    for v_account in select akun, sum(nominal) as nominal from public.bulk_order_payments where bulk_order_id = p_order_id group by akun having sum(nominal) > 0 loop
      insert into public.bulk_order_payments (bulk_order_id, nominal, akun, tipe, keterangan) values (p_order_id, -v_account.nominal, v_account.akun, 'Reversal', 'Reversal pembayaran karena pesanan massal dibatalkan');
      insert into public.finance_transactions (tipe, sumber, bulk_order_id, kategori, keterangan, nominal, akun) values ('Keluar', 'Pesanan Massal', p_order_id, 'Pembatalan Pesanan', 'Reversal pembayaran karena pesanan massal dibatalkan', v_account.nominal, v_account.akun);
    end loop;
    update public.bulk_orders set status = p_status, nominal_dibayar = 0, sisa = total, status_bayar = 'Belum Bayar' where id = p_order_id;
  else
    update public.bulk_orders set status = p_status where id = p_order_id;
  end if;
  return jsonb_build_object('id', p_order_id, 'status', p_status);
end;
$$;

revoke all on function public.create_bulk_order(jsonb) from public;
revoke all on function public.append_bulk_order_payment(uuid, numeric, text, text) from public;
revoke all on function public.void_bulk_order_payment(uuid, uuid) from public;
revoke all on function public.set_bulk_order_status(uuid, text) from public;
grant execute on function public.create_bulk_order(jsonb) to service_role;
grant execute on function public.append_bulk_order_payment(uuid, numeric, text, text) to service_role;
grant execute on function public.void_bulk_order_payment(uuid, uuid) to service_role;
grant execute on function public.set_bulk_order_status(uuid, text) to service_role;

-- Verification after a manual test order:
-- select b.id, b.total, sum(i.total) as total_items, b.nominal_dibayar, sum(p.nominal) as total_payments
-- from public.bulk_orders b left join public.bulk_order_items i on i.bulk_order_id=b.id left join public.bulk_order_payments p on p.bulk_order_id=b.id
-- group by b.id order by b.created_at desc limit 10;
