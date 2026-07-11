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
