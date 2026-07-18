-- Tambah kolom pinned ke tabel products
-- Jalankan di Supabase SQL Editor (satu kali)

ALTER TABLE products ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

-- Index biar sorting pinned lebih cepet
CREATE INDEX IF NOT EXISTS idx_products_pinned ON products (pinned DESC);
