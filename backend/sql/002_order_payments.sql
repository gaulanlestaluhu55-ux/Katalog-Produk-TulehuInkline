-- ═══════════════════════════════════════════════════════
-- TULEHU INKLINE — 002_order_payments (riwayat cicilan per akun)
-- Jalankan sekali di Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- Sifat: ADDITIVE ONLY — tidak mengubah/menghapus tabel & baris existing.
-- Rollback bila perlu: drop table if exists public.order_payments;
-- ═══════════════════════════════════════════════════════

-- ── TABEL: 1 baris = 1 cicilan (DP/Pelunasan/Koreksi/Reversal) ──
create table if not exists public.order_payments (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz default now(),
  id_pesanan        uuid references public.orders(id) on delete cascade,
  nominal           numeric not null,          -- + = uang masuk, - = koreksi/reversal keluar
  akun              text default 'Kas',         -- akun TUJUAN/ASAL tiap cicilan
  tipe              text default 'Cicilan',     -- DP | Pelunasan | Cicilan | Koreksi | Reversal
  keterangan        text default ''
);

create index if not exists idx_order_payments_pesanan on public.order_payments(id_pesanan);

-- ── BACKFILL IDEMPOTEN dari finance_transactions (sumber Pesanan) ──
-- Aman di-run ulang: baris yang sudah ada (pesanan + waktu + nominal sama) dilewati.
-- Batasan jujur: pembayaran order yang sudah DIHAPUS tak bisa dipulihkan
-- (finance-nya id_pesanan-nya NULL) — nominalnya tetap di finance, akunnya tetap benar di sana.
insert into public.order_payments (id_pesanan, nominal, akun, tipe, keterangan, created_at)
select
  f.id_pesanan,
  case when f.tipe = 'Keluar' then -abs(f.nominal) else abs(f.nominal) end,
  coalesce(nullif(f.akun, ''), 'Kas'),
  case
    when f.kategori = 'Pembatalan Pesanan' then 'Reversal'
    when f.tipe = 'Keluar' then 'Koreksi'
    else 'Cicilan'
  end,
  f.keterangan,
  f.created_at
from public.finance_transactions f
where f.sumber = 'Pesanan'
  and f.id_pesanan is not null
  and not exists (
    select 1 from public.order_payments p
    where p.id_pesanan = f.id_pesanan
      and p.created_at = f.created_at
      and p.nominal = case when f.tipe = 'Keluar' then -abs(f.nominal) else abs(f.nominal) end
  );

-- ═══════════════════════════════════════════════════════
-- VERIFIKASI (jalankan satu per satu, baca hasilnya)
-- ───────────────────────────────────────────────────────
-- Q1 — sebaran hasil backfill:
--   select tipe, count(*), sum(nominal) from public.order_payments group by tipe;
--
-- Q2 — crosscheck per order (HARUS kosong = cocok):
--   select o.id, o.nama_customer, o.nama_produk,
--     o.nominal_dibayar as tercatat,
--     coalesce(sum(p.nominal), 0) as hitung_riwayat,
--     o.nominal_dibayar - coalesce(sum(p.nominal), 0) as selisih
--   from public.orders o
--   left join public.order_payments p on p.id_pesanan = o.id
--   group by o.id
--   having abs(o.nominal_dibayar - coalesce(sum(p.nominal), 0)) > 0.01;
--
-- Q3 — contoh use case DP Bank + pelunasan Kas (ganti id order):
--   select created_at, tipe, nominal, akun, keterangan
--   from public.order_payments
--   where id_pesanan = '<isi-id-order>'
--   order by created_at;
-- ═══════════════════════════════════════════════════════

-- ── RLS: sama seperti 001 — dimatikan, auth di layer API pakai token ──
