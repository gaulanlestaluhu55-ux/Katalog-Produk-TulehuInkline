export function toNumSafe(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function computeStatusBayar(nominalDibayar, total) {
  if (total <= 0) return 'Lunas';
  if (nominalDibayar <= 0) return 'Belum Bayar';
  if (nominalDibayar >= total) return 'Lunas';
  return 'DP';
}

export function calculateOrderPricing({ hargaSatuan, qty, discountType, discountValue }) {
  const unit = Math.max(0, toNumSafe(hargaSatuan));
  const quantity = Math.max(1, Math.floor(toNumSafe(qty) || 1));
  const subtotal = unit * quantity;
  const type = String(discountType || 'nominal').trim();
  const value = Number(discountValue ?? 0);

  if (!['nominal', 'percent'].includes(type)) {
    return { ok: false, message: 'Tipe diskon tidak valid.' };
  }
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, message: 'Nilai diskon tidak valid.' };
  }
  if (type === 'percent' && value > 100) {
    return { ok: false, message: 'Diskon persen maksimal 100%.' };
  }
  if (type === 'nominal' && value > subtotal) {
    return { ok: false, message: 'Diskon nominal tidak boleh melebihi subtotal.' };
  }

  const discountAmount = type === 'percent' ? subtotal * (value / 100) : value;
  return {
    ok: true,
    unit,
    qty: quantity,
    subtotal,
    discountType: type,
    discountValue: value,
    discountAmount,
    total: Math.max(0, subtotal - discountAmount),
  };
}

export const ACTIVE_ORDER_STATUSES = ['Baru', 'Diproses'];

// Tambah 1 baris ke ledger keuangan. Dipanggil dari orders API pas ada pembayaran/reversal.
export async function appendLedger(supabase, { tipe, sumber, id_pesanan, kategori, keterangan, nominal, akun }) {
  const { error } = await supabase.from('finance_transactions').insert({
    tipe,
    sumber,
    id_pesanan: id_pesanan || null,
    kategori: kategori || '',
    keterangan: keterangan || '',
    nominal,
    akun: akun || 'Kas',
  });
  if (error) throw error;
}

/* Net per akun dari riwayat cicilan (B2). Semua baris dijumlah signed
   (Reversal negatif ikut mengimbangi) → sisa yang benar-benar masih
   dipegang per akun. Hasil: { akun: total } yang > 0. */
export function paymentNetPerAkun(rows) {
  const net = {};
  for (const r of rows || []) {
    const akun = r.akun || 'Kas';
    net[akun] = (net[akun] || 0) + Number(r.nominal || 0);
  }
  const out = {};
  for (const k of Object.keys(net)) {
    if (net[k] > 0) out[k] = net[k];
  }
  return out;
}

/* Validasi tambah-bayar (F1, pure — gampang di-unit-test tanpa DB).
   Return { ok:true } atau { ok:false, message }. */
export function validateTambahBayar({ total, oldNominal, tambah, akun }) {
  if (!String(akun || '').trim()) return { ok: false, message: 'Akun wajib diisi untuk setiap pembayaran.' };
  if (!(tambah > 0)) return { ok: false, message: 'Nominal tambah harus lebih dari 0.' };
  const sisa = toNumSafe(total) - toNumSafe(oldNominal);
  if (tambah - sisa > 0.01) return { ok: false, message: 'Nominal melebihi sisa pembayaran.' };
  return { ok: true };
}

/* Sum riwayat cicilan per order (F1 — sumber kebenaran tunggal).
   Signed: DP/Pelunasan/Cicilan positif, Koreksi/Reversal negatif. */
export async function sumOrderPayments(supabase, idPesanan) {
  const { data, error } = await supabase
    .from('order_payments')
    .select('nominal')
    .eq('id_pesanan', idPesanan);
  if (error) throw error;
  return (data || []).reduce((acc, r) => acc + Number(r.nominal || 0), 0);
}

/* Void 1 baris cicilan (F3): insert Koreksi negatif + ledger Keluar ke akun ASAL.
   Hanya tipe DP/Pelunasan/Cicilan bernominal positif yang belum pernah di-void
   (penanda: belum ada Koreksi dengan keterangan memuat `void:<id>`).
   Koreksi sebagian = void penuh lalu tambah baru yang benar. Throw bila tak valid. */
export async function voidOrderPayment(supabase, idPesanan, paymentId, orderLabel) {
  const { data: row, error: readErr } = await supabase
    .from('order_payments')
    .select('*')
    .eq('id', paymentId)
    .single();
  if (readErr || !row) throw new Error('Baris pembayaran tidak ditemukan.');
  if (String(row.id_pesanan) !== String(idPesanan)) throw new Error('Baris pembayaran bukan milik pesanan ini.');
  if (!['DP', 'Pelunasan', 'Cicilan'].includes(row.tipe)) throw new Error('Hanya baris DP/Pelunasan yang bisa dikoreksi.');
  const nominal = Number(row.nominal || 0);
  if (!(nominal > 0)) throw new Error('Baris ini tidak punya nominal positif.');
  const tag = `void:${paymentId}`;
  const { data: existing, error: checkErr } = await supabase
    .from('order_payments')
    .select('id')
    .eq('id_pesanan', idPesanan)
    .like('keterangan', `%${tag}%`);
  if (checkErr) throw checkErr;
  if ((existing || []).length) throw new Error('Baris ini sudah pernah dikoreksi.');
  const keterangan = `Koreksi ${tag} — ${orderLabel} (void ${row.tipe} ${row.akun})`;
  await appendLedger(supabase, {
    tipe: 'Keluar',
    sumber: 'Pesanan',
    id_pesanan: idPesanan,
    kategori: 'Koreksi Pembayaran',
    keterangan,
    nominal,
    akun: row.akun,
  });
  const { error: payErr } = await supabase.from('order_payments').insert({
    id_pesanan: idPesanan,
    nominal: -nominal,
    akun: row.akun,
    tipe: 'Koreksi',
    keterangan,
  });
  if (payErr) throw payErr;
  return { nominal, akun: row.akun };
}

/* Reversal pembatalan per akun asal (B2 — ganti hardcode Kas). */
export async function reversePaymentsToLedger(supabase, idPesanan, order) {
  const { data: rows, error: readErr } = await supabase
    .from('order_payments')
    .select('akun, nominal, tipe')
    .eq('id_pesanan', idPesanan);
  if (readErr) throw readErr;
  const net = paymentNetPerAkun(rows);
  const akuns = Object.keys(net).sort();
  const nama = `${order.nama_produk} (${order.nama_customer})`;
  if (!akuns.length) {
    await appendLedger(supabase, {
      tipe: 'Keluar',
      sumber: 'Pesanan',
      id_pesanan: idPesanan,
      kategori: 'Pembatalan Pesanan',
      keterangan: `Reversal pembayaran — ${nama} dibatalkan`,
      nominal: toNumSafe(order.nominal_dibayar),
      akun: 'Kas',
    });
    return { fallback: true, akuns: [] };
  }
  for (const akun of akuns) {
    await appendLedger(supabase, {
      tipe: 'Keluar',
      sumber: 'Pesanan',
      id_pesanan: idPesanan,
      kategori: 'Pembatalan Pesanan',
      keterangan: `Reversal pembayaran — ${nama} dibatalkan`,
      nominal: net[akun],
      akun,
    });
    const { error: payErr } = await supabase.from('order_payments').insert({
      id_pesanan: idPesanan,
      nominal: -net[akun],
      akun,
      tipe: 'Reversal',
      keterangan: `Reversal — ${nama} dibatalkan`,
    });
    if (payErr) throw payErr;
  }
  return { fallback: false, akuns };
}

/* Normalisasi varian (C2). Aturan = cermin migrasi 003 + js/config.js:
   trim + collapse spasi; size → uppercase (XXXL → 3XL);
   warna/lengan/cuttingan → nilai kanonis bila cocok case-insensitive,
   nilai asing dipertahankan apa adanya (jangan ditebak). */
const NORM_WARNA = ['Putih', 'Hitam', 'Abu-abu', 'Navy', 'Maroon', 'Kuning', 'Hijau Botol', 'Baby Blue', 'Krem', 'Merah'];
const NORM_LENGAN = ['Lengan Pendek', 'Lengan Panjang'];
const NORM_CUTTINGAN = ['Reguler', 'Oversize'];

export function normVariant(field, value) {  const s = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  if (field === 'size') {
    const u = s.toUpperCase();
    return u === 'XXXL' ? '3XL' : u;
  }
  const list = field === 'warna' ? NORM_WARNA : field === 'lengan' ? NORM_LENGAN : field === 'cuttingan' ? NORM_CUTTINGAN : [];
  const hit = list.find((c) => c.toLowerCase() === s.toLowerCase());
  return hit || s;
}

/* Normalisasi daftar pipe-separated (D1: sizes/colors per produk).
   Trim + buang kosong + dedupe. '' = fallback global. */
export function pipeList(value) {
  const parts = String(value ?? '').split('|').map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts)].join('|');
}
