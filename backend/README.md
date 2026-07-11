# Tulehu Inkline — Backend (Vercel + Supabase)

Pengganti backend GAS + Google Sheets. Semua endpoint & logic (termasuk pencatatan
pembayaran otomatis ke Keuangan, reversal saat pesanan dibatalkan, rekap stok vendor)
udah dipindah 1:1 dari `Code.gs`.

## 1. Setup Supabase

1. Buat project baru di https://supabase.com/dashboard
2. Buka **SQL Editor** → New query → paste isi `sql/001_schema.sql` → Run
3. Ambil kredensial dari **Project Settings → API**:
   - `Project URL` → jadi `SUPABASE_URL`
   - `service_role` key (bagian **Project API keys**, BUKAN `anon` key) → jadi `SUPABASE_SERVICE_ROLE_KEY`

## 2. Deploy ke Vercel

1. Push folder ini ke repo GitHub baru (misal `tulehu-inkline-backend`)
2. Di https://vercel.com/dashboard → **Add New → Project** → import repo itu
3. Di step **Environment Variables**, isi:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_TOKEN` (samain persis kayak token yang dulu dipakai di GAS, biar login admin di frontend gak perlu ganti)
4. Deploy. Setelah selesai, Vercel kasih URL kayak `https://tulehu-inkline-backend.vercel.app`

## 3. Migrasi data lama

Di komputer lokal (bukan di Vercel):

```bash
git clone <repo-ini>
cd tulehu-inkline-backend
npm install
cp .env.example .env
# isi .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN, OLD_GAS_URL (URL GAS lama, masih harus aktif)
node --env-file=.env scripts/migrate-from-gas.js
```

Cek hasilnya di Supabase **Table Editor** — pastiin jumlah baris di tiap tabel sesuai sama Sheets lama.

⚠️ Checklist "Sudah Dipesan" di Stok Vendor gak ikut kepindah otomatis (GAS gak expose data mentahnya) — tinggal tandain ulang manual abis pindah kalau perlu.

## 4. Update frontend

Semua file HTML (`admin.html`, `pesanan.html`, `keuangan.html`, `stok.html`, `vendor.html`, `index.html`)
perlu di-update `CONFIG.apiUrl`-nya ke URL Vercel yang baru, dan cara manggil API-nya berubah dari
pola GAS (`action` di body) ke REST biasa (method GET/POST/PUT/DELETE + `Authorization: Bearer <token>` header).
Ini dikerjain terpisah, nanti dikirim sebagai file yang udah di-update.

## Struktur endpoint

| Endpoint | Method | Fungsi |
|---|---|---|
| `/api/products` | GET, POST | List produk (admin lihat semua, publik cuma aktif) / tambah produk |
| `/api/products/:id` | PUT, PATCH | Update produk / toggle aktif |
| `/api/orders` | GET, POST | List pesanan / catat pesanan baru |
| `/api/orders/:id` | PUT, DELETE | Update status pesanan / hapus |
| `/api/orders/:id?action=payment` | PUT | Update pembayaran (otomatis catat ke Keuangan) |
| `/api/finance` | GET, POST | Riwayat transaksi / catat transaksi manual |
| `/api/finance/:id` | DELETE | Hapus transaksi manual (transaksi dari pesanan diblokir) |
| `/api/accounts` | GET, POST | List akun / tambah akun |
| `/api/accounts/:id` | DELETE | Hapus akun |
| `/api/vendors` | GET, POST | List vendor / tambah vendor |
| `/api/vendors/:id` | PUT, DELETE | Update / hapus vendor |
| `/api/stock` | GET | Rekap kebutuhan stok (live agregasi dari pesanan aktif) |
| `/api/stock/status` | POST | Update checklist "sudah dipesan" + assign vendor |

Semua endpoint (kecuali `GET /api/products` tanpa token) butuh header:
```
Authorization: Bearer <ADMIN_TOKEN>
```
