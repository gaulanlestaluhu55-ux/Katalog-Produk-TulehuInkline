-- ═══════════════════════════════════════════════════════
-- TULEHU INKLINE — Skema Database (Supabase / Postgres)
-- Jalankan file ini sekali di Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ═══════════════════════════════════════════════════════

create extension if not exists "pgcrypto"; -- buat gen_random_uuid()

-- ── PRODUK (dulu Sheet "Katalog") ──
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  nama              text not null,
  kategori          text default '',
  badge             text default '',
  deskripsi         text default '',
  harga             numeric default 0,
  satuan            text default '/pcs',
  gambar            text default '',        -- multi-gambar dipisah "|", sama kayak sebelumnya
  harga_nama        numeric default 0,       -- khusus jersey
  harga_angka       numeric default 0,       -- khusus jersey
  harga_nama_angka  numeric default 0,       -- khusus jersey
  aktif             boolean default true,
  created_at        timestamptz default now()
);

-- ── PESANAN (dulu Sheet "Pesanan") ──
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz default now(),
  id_produk         uuid references public.products(id) on delete set null,
  nama_produk       text default '',
  kategori          text default '',
  opsi              text default '',
  size              text default '',
  warna             text default '',
  lengan            text default '',
  qty               integer default 1,
  harga_satuan      numeric default 0,
  total             numeric default 0,
  nama_customer     text default '',
  kontak            text default '',
  status            text default 'Baru',            -- Baru | Diproses | Selesai | Diambil | Batal
  catatan           text default '',
  status_bayar      text default 'Belum Bayar',      -- Belum Bayar | DP | Lunas
  nominal_dibayar   numeric default 0,
  sisa              numeric default 0
);

-- ── KEUANGAN (dulu Sheet "Keuangan") ──
create table if not exists public.finance_transactions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz default now(),
  tipe              text not null,           -- Masuk | Keluar
  sumber            text not null default 'Manual', -- Pesanan | Manual
  id_pesanan        uuid references public.orders(id) on delete set null,
  kategori          text default '',
  keterangan        text default '',
  nominal           numeric not null,
  akun              text default 'Kas'
);

-- ── AKUN (dulu Sheet "Akun") ──
create table if not exists public.accounts (
  id                uuid primary key default gen_random_uuid(),
  nama              text not null unique
);

-- ── VENDOR (dulu Sheet "Vendor") ──
create table if not exists public.vendors (
  id                uuid primary key default gen_random_uuid(),
  nama              text not null,
  no_wa             text default '',
  catatan           text default ''
);

-- ── STOK VENDOR — checklist (dulu Sheet "StokVendor") ──
create table if not exists public.stock_vendor_status (
  key               text primary key,        -- format: jenis|size|warna|lengan
  jenis             text default '',
  size              text default '',
  warna             text default '',
  lengan            text default '',
  status            text default 'Belum Dipesan',
  vendor_id         uuid references public.vendors(id) on delete set null,
  updated_at        timestamptz default now()
);

-- ── Index buat query yang sering dipakai ──
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_finance_akun on public.finance_transactions(akun);
create index if not exists idx_products_aktif on public.products(aktif);

-- ── Seed 2 akun default ──
insert into public.accounts (nama) values ('Kas'), ('Bank')
  on conflict (nama) do nothing;

-- ── RLS: dimatikan (auth ditangani di layer API pakai token, bukan di level Postgres) ──
-- Karena API pakai Supabase service_role key dari backend Vercel (bukan diakses langsung dari
-- browser), RLS gak wajib dinyalain. Kalau suatu saat mau expose Supabase langsung ke frontend,
-- WAJIB nyalain RLS dulu di semua tabel di atas.
