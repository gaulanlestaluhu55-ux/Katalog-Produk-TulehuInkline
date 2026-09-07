-- ═══════════════════════════════════════════════════════
-- TULEHU INKLINE — 003_cuttingan + normalisasi varian
-- Jalankan di Supabase SQL Editor setelah 002.
-- Sifat: kolom baru + isi yang kosong + rapikan case/spasi varian known.
-- Tidak menghapus baris; tidak mengubah nilai non-varian.
-- Rollback: alter table public.orders drop column if exists cuttingan;
--   (cleanup case tidak reversible otomatis — backup dulu bila ragu:
--    create table public.orders_backup_003 as select * from public.orders;)
-- ═══════════════════════════════════════════════════════

-- ── 1) Kolom cuttingan ──
alter table public.orders add column if not exists cuttingan text default '';

-- ── 2) Backfill dari string opsi (hanya yang masih kosong) ──
update public.orders
set cuttingan = trim(both ' ' from substring(opsi from 'Cuttingan\s*:\s*([^,]+)'))
where (cuttingan is null or cuttingan = '')
  and opsi ilike '%cuttingan:%';

-- ── 3) Rapikan spasi (trim + collapse spasi ganda) ──
update public.orders
set size = regexp_replace(trim(both ' ' from size), '\s+', ' ', 'g'),
    warna = regexp_replace(trim(both ' ' from warna), '\s+', ' ', 'g'),
    lengan = regexp_replace(trim(both ' ' from lengan), '\s+', ' ', 'g'),
    cuttingan = regexp_replace(trim(both ' ' from coalesce(cuttingan, '')), '\s+', ' ', 'g')
where size <> regexp_replace(trim(both ' ' from size), '\s+', ' ', 'g')
   or warna <> regexp_replace(trim(both ' ' from warna), '\s+', ' ', 'g')
   or lengan <> regexp_replace(trim(both ' ' from lengan), '\s+', ' ', 'g')
   or coalesce(cuttingan, '') <> regexp_replace(trim(both ' ' from coalesce(cuttingan, '')), '\s+', ' ', 'g');

-- ── 4) Kanonik case varian known → nilai CONFIG (eksplisit, tanpa tebak) ──
-- Size: uppercase + XXXL → 3XL
update public.orders set size = '3XL' where upper(size) in ('XXXL', '3XL') and size <> '3XL';
update public.orders set size = upper(size)
where upper(size) in ('S', 'M', 'L', 'XL', 'XXL') and size <> upper(size);

-- Warna kanonis (sama persis dengan js/config.js)
update public.orders as o set warna = m.canon
from (values ('putih', 'Putih'), ('hitam', 'Hitam'), ('abu-abu', 'Abu-abu'),
  ('navy', 'Navy'), ('maroon', 'Maroon'), ('kuning', 'Kuning'),
  ('hijau botol', 'Hijau Botol'), ('baby blue', 'Baby Blue'),
  ('krem', 'Krem'), ('merah', 'Merah')) as m(low, canon)
where lower(o.warna) = m.low and o.warna <> m.canon;

-- Lengan kanonis
update public.orders as o set lengan = m.canon
from (values ('lengan pendek', 'Lengan Pendek'),
  ('lengan panjang', 'Lengan Panjang')) as m(low, canon)
where lower(o.lengan) = m.low and o.lengan <> m.canon;

-- Cuttingan kanonis
update public.orders as o set cuttingan = m.canon
from (values ('reguler', 'Reguler'), ('oversize', 'Oversize')) as m(low, canon)
where lower(o.cuttingan) = m.low and o.cuttingan <> m.canon;

-- ═══════════════════════════════════════════════════════
-- VERIFIKASI
-- ───────────────────────────────────────────────────────
-- V1 — distinct harus kanonis / kosong / nilai asing yang dipertahankan:
--   select distinct size from public.orders order by 1;
--   select distinct warna from public.orders order by 1;
--   select distinct lengan from public.orders order by 1;
--   select distinct cuttingan from public.orders order by 1;
--
-- V2 — backfill tuntas (HARUS 0):
--   select count(*) from public.orders
--   where opsi ilike '%cuttingan:%' and (cuttingan is null or cuttingan = '');
--
-- V3 — cuttingan terisi berapa:
--   select cuttingan, count(*) from public.orders group by 1 order by 2 desc;
-- ═══════════════════════════════════════════════════════
