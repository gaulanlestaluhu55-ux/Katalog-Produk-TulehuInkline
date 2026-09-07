export function toNumSafe(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function computeStatusBayar(nominalDibayar, total) {
  if (nominalDibayar <= 0) return 'Belum Bayar';
  if (nominalDibayar >= total) return 'Lunas';
  return 'DP';
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

/* Reversal pembatalan per akun asal (B2 — ganti hardcode Kas).
   Fallback: tanpa riwayat cicilan → single reversal Kas (perilaku lama). */
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
