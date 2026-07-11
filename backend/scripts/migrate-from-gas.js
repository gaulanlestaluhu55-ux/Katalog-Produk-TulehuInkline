/**
 * ═══════════════════════════════════════════════════════
 * MIGRASI DATA: GAS + Google Sheets  ->  Supabase
 * ═══════════════════════════════════════════════════════
 * Jalankan SEKALI aja, dari komputer lokal (bukan di Vercel).
 *
 * Syarat:
 * - GAS Web App yang lama masih aktif/ke-deploy (belum dimatikan)
 * - Node.js versi 20+ (buat fitur --env-file)
 * - Sudah isi file .env (copy dari .env.example)
 *
 * Cara jalanin:
 *   npm install
 *   node --env-file=.env scripts/migrate-from-gas.js
 *
 * CATATAN PENTING:
 * - Checklist "StokVendor" (sudah dipesan/belum) TIDAK ikut dimigrasi otomatis, karena GAS
 *   gak expose raw data sheet itu (cuma versi teragregasi). Ini data operasional yang gak fatal
 *   kalau reset — tinggal tandain ulang manual abis pindah kalau ada yang perlu.
 * - Script ini aman dijalankan berkali-kali? TIDAK — ini bakal bikin data dobel kalau dijalanin
 *   lebih dari sekali. Jalankan cuma 1x, di akhir proses migrasi.
 */

console.log("Cek Token:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "Ada" : "KOSONG!");
console.log("Cek Admin Token:", process.env.ADMIN_TOKEN ? "Ada" : "KOSONG!");
console.log("Cek OLD_GAS_URL:", process.env.OLD_GAS_URL ? "Ada" : "KOSONG!");
console.log("Cek SUPABASE_URL:", process.env.SUPABASE_URL ? "Ada" : "KOSONG!");
console.log("Cek SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "Ada" : "KOSONG!");
import { createClient } from '@supabase/supabase-js';

const GAS_URL = process.env.OLD_GAS_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GAS_URL || !ADMIN_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Env var belum lengkap. Cek .env — butuh OLD_GAS_URL, ADMIN_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchFromGas(resource) {
  const url = resource
    ? `${GAS_URL}?resource=${resource}&token=${encodeURIComponent(ADMIN_TOKEN)}`
    : `${GAS_URL}?token=${encodeURIComponent(ADMIN_TOKEN)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== 'success') throw new Error(`Gagal fetch ${resource || 'produk'}: ${json.message}`);
  return json.data;
}

function toNum(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function toBool(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

async function migrateProducts() {
  console.log('→ Migrasi produk...');
  const rows = await fetchFromGas(null);
  if (!rows.length) { console.log('  (kosong, skip)'); return; }

  const payload = rows
    .filter((r) => r.id) // skip baris tanpa id
    .map((r) => ({
      id: r.id,
      nama: r.nama || '',
      kategori: r.kategori || '',
      badge: r.badge || '',
      deskripsi: r.deskripsi || '',
      harga: toNum(r.harga),
      satuan: r.satuan || '/pcs',
      gambar: r.gambar || '',
      harga_nama: toNum(r.harga_nama),
      harga_angka: toNum(r.harga_angka),
      harga_nama_angka: toNum(r.harga_nama_angka),
      aktif: toBool(r.aktif),
    }));

  const { error } = await supabase.from('products').upsert(payload, { onConflict: 'id' });
  if (error) throw error;
  console.log(`  ✓ ${payload.length} produk berhasil dipindah.`);
}

async function migrateAccounts() {
  console.log('→ Migrasi akun keuangan...');
  const rows = await fetchFromGas('akun');
  if (!rows.length) { console.log('  (kosong, skip)'); return; }

  const payload = rows.filter((r) => r.id).map((r) => ({ id: r.id, nama: r.nama || '' }));
  const { error } = await supabase.from('accounts').upsert(payload, { onConflict: 'id' });
  if (error) throw error;
  console.log(`  ✓ ${payload.length} akun berhasil dipindah.`);
}

async function migrateVendors() {
  console.log('→ Migrasi vendor...');
  const rows = await fetchFromGas('vendor');
  if (!rows.length) { console.log('  (kosong, skip)'); return; }

  const payload = rows.filter((r) => r.id).map((r) => ({
    id: r.id,
    nama: r.nama || '',
    no_wa: r.no_wa || '',
    catatan: r.catatan || '',
  }));

  const { error } = await supabase.from('vendors').upsert(payload, { onConflict: 'id' });
  if (error) throw error;
  console.log(`  ✓ ${payload.length} vendor berhasil dipindah.`);
}

async function migrateOrders() {
  console.log('→ Migrasi pesanan...');
  const rows = await fetchFromGas('pesanan');
  if (!rows.length) { console.log('  (kosong, skip)'); return; }

  const payload = rows.filter((r) => r.id).map((r) => ({
    id: r.id,
    created_at: r.timestamp || new Date().toISOString(),
    id_produk: r.id_produk || null,
    nama_produk: r.nama_produk || '',
    kategori: r.kategori || '',
    opsi: r.opsi || '',
    size: r.size || '',
    warna: r.warna || '',
    lengan: r.lengan || '',
    qty: toNum(r.qty) || 1,
    harga_satuan: toNum(r.harga_satuan),
    total: toNum(r.total),
    nama_customer: r.nama_customer || '',
    kontak: r.kontak || '',
    status: r.status || 'Baru',
    catatan: r.catatan || '',
    status_bayar: r.status_bayar || 'Belum Bayar',
    nominal_dibayar: toNum(r.nominal_dibayar),
    sisa: toNum(r.sisa),
  }));

  // id_produk kadang nunjuk ke produk yang udah gak ada / kosong — biar gak gagal FK constraint,
  // insert produk dulu (udah dijamin urutan lewat migrateProducts() yang jalan sebelumnya).
  const { error } = await supabase.from('orders').upsert(payload, { onConflict: 'id' });
  if (error) throw error;
  console.log(`  ✓ ${payload.length} pesanan berhasil dipindah.`);
}

async function migrateFinance() {
  console.log('→ Migrasi transaksi keuangan...');
  const rows = await fetchFromGas('keuangan');
  if (!rows.length) { console.log('  (kosong, skip)'); return; }

  const payload = rows.filter((r) => r.id).map((r) => ({
    id: r.id,
    created_at: r.timestamp || new Date().toISOString(),
    tipe: r.tipe || 'Masuk',
    sumber: r.sumber || 'Manual',
    id_pesanan: r.id_pesanan || null,
    kategori: r.kategori || '',
    keterangan: r.keterangan || '',
    nominal: toNum(r.nominal),
    akun: r.akun || 'Kas',
  }));

  const { error } = await supabase.from('finance_transactions').upsert(payload, { onConflict: 'id' });
  if (error) throw error;
  console.log(`  ✓ ${payload.length} transaksi berhasil dipindah.`);
}

async function main() {
  console.log('═══ Mulai migrasi data GAS -> Supabase ═══\n');
  try {
    // Urutan penting: produk & vendor dulu (biar foreign key orders/stock gak nabrak),
    // baru orders, baru finance (karena finance.id_pesanan nunjuk ke orders).
    await migrateProducts();
    await migrateAccounts();
    await migrateVendors();
    await migrateOrders();
    await migrateFinance();
    console.log('\n✅ Migrasi selesai! Cek datanya di Supabase Table Editor buat mastiin semua lengkap.');
  } catch (err) {
    console.error('\n❌ Migrasi gagal:', err.message);
    process.exit(1);
  }
}

main();
