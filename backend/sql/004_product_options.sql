-- ═══════════════════════════════════════════════════════
-- TULEHU INKLINE — 004_product_options (warna/size per produk)
-- Jalankan di Supabase SQL Editor setelah 003.
-- Sifat: 2 kolom baru, default '' = fallback daftar global (CONFIG).
-- Tanpa backfill perilaku: semua produk existing tetap pakai global
-- sampai admin mengatur spesifik per produk. Tidak ada UPDATE/DELETE.
-- Rollback: alter table public.products drop column if exists sizes;
--           alter table public.products drop column if exists colors;
-- ═══════════════════════════════════════════════════════

alter table public.products add column if not exists sizes text default '';
alter table public.products add column if not exists colors text default '';

-- ═══════════════════════════════════════════════════════
-- VERIFIKASI
--   select id, nama, sizes, colors from public.products order by nama;
-- Harus: kolom ada, semua '' (fallback global, perilaku tidak berubah).
-- ═══════════════════════════════════════════════════════
