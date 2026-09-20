import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';
import { toNumSafe, computeStatusBayar, appendLedger, reversePaymentsToLedger, normVariant, validateTambahBayar, sumOrderPayments, voidOrderPayment, calculateOrderPricing } from '../../lib/helpers.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const { id, action } = req.query;
  if (!id) return res.status(400).json({ status: 'error', message: 'id wajib diisi' });

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id } });
  }

  // B3: riwayat cicilan per order (DP/Pelunasan/Koreksi/Reversal + akun).
  if (req.method === 'GET' && action === 'payments') {
    const { data, error } = await supabase
      .from('order_payments')
      .select('*')
      .eq('id_pesanan', id)
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: data || [] });
  }

  if (req.method === 'PUT' && action === 'payment') {
    return handleUpdatePayment(req, res, id);
  }

  if (req.method === 'PUT' && action === 'void-payment') {
    return handleVoidPayment(req, res, id);
  }

  if (req.method === 'PUT' && action === 'details') {
    return handleUpdateDetails(req, res, id);
  }

  if (req.method === 'PUT') {
    return handleUpdateStatus(req, res, id);
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}

async function handleUpdateStatus(req, res, id) {
  const body = req.body || {};
  const newStatus = body.status || 'Baru';

  const { data: order, error: readErr } = await supabase.from('orders').select('*').eq('id', id).single();
  if (readErr) return res.status(500).json({ status: 'error', message: readErr.message });
  if (!order) return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });

  const patch = { status: newStatus };
  if (body.hasOwnProperty('catatan')) patch.catatan = body.catatan;

  // Reversal otomatis kalau dibatalkan & sempat ada pembayaran.
  // Sejak B2: reversal per akun asal (order_payments), bukan hardcode Kas.
  if (newStatus === 'Batal' && toNumSafe(order.nominal_dibayar) > 0) {
    try {
      await reversePaymentsToLedger(supabase, id, order);
    } catch (ledgerErr) {
      return res.status(500).json({ status: 'error', message: 'Gagal mencatat reversal: ' + ledgerErr.message });
    }
    patch.nominal_dibayar = 0;
    patch.sisa = toNumSafe(order.total);
    patch.status_bayar = 'Belum Bayar';
  }

  const { error: updateErr } = await supabase.from('orders').update(patch).eq('id', id);
  if (updateErr) return res.status(500).json({ status: 'error', message: updateErr.message });

  return res.status(200).json({ status: 'success', data: { id, status: newStatus } });
}

/* Update detail atribut (size/warna/lengan/opsi/qty/harga). Dipakai grid fase 3.
   Total WAJIB = harga_satuan x qty (pengaman D6). Nominal lama tak boleh
   melebihi total baru. Tidak ada pergerakan uang → tanpa ledger. */
async function handleUpdateDetails(req, res, id) {
  const body = req.body || {};

  const { data: order, error: readErr } = await supabase.from('orders').select('*').eq('id', id).single();
  if (readErr) return res.status(500).json({ status: 'error', message: readErr.message });
  if (!order) return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });

  const pricing = calculateOrderPricing({
    hargaSatuan: body.harga_satuan,
    qty: body.qty,
    discountType: body.hasOwnProperty('discount_type') ? body.discount_type : order.discount_type,
    discountValue: body.hasOwnProperty('discount_value') ? body.discount_value : order.discount_value,
  });
  if (!pricing.ok) return res.status(400).json({ status: 'error', message: pricing.message });
  const { qty, unit: hargaSatuan, total } = pricing;
  const dibayar = toNumSafe(order.nominal_dibayar);
  if (dibayar > total) {
    return res.status(400).json({ status: 'error', message: 'Nominal dibayar melebihi total baru. Koreksi pembayaran via Keuangan dulu.' });
  }

  const sisa = total - dibayar;
  const patch = {
    size: normVariant('size', body.size),
    warna: normVariant('warna', body.warna),
    lengan: normVariant('lengan', body.lengan),
    cuttingan: normVariant('cuttingan', body.cuttingan),
    opsi: String(body.opsi || '').trim(),
    qty,
    harga_satuan: hargaSatuan,
    total,
    discount_type: pricing.discountType,
    discount_value: pricing.discountValue,
    sisa,
    status_bayar: computeStatusBayar(dibayar, total),
  };

  const { error: updateErr } = await supabase.from('orders').update(patch).eq('id', id);
  if (updateErr) return res.status(500).json({ status: 'error', message: updateErr.message });

  return res.status(200).json({ status: 'success', data: { id, ...patch } });
}

/* Update pembayaran — dua kontrak (F1):
   - BARU (append-only): { tambah, akun } → 1 baris cicilan baru. nominal_dibayar
     dihitung ulang server dari sum(order_payments). Overpay & akun kosong → 400.
   - LEGACY (transisi, dihapus di F4): { nominal_dibayar, akun } → diperketat
     (akun wajib, overpay diblokir). Grid lama masih pakai ini sampai F2. */
async function handleUpdatePayment(req, res, id) {
  const body = req.body || {};

  const { data: order, error: readErr } = await supabase.from('orders').select('*').eq('id', id).single();
  if (readErr) return res.status(500).json({ status: 'error', message: readErr.message });
  if (!order) return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });

  const total = toNumSafe(order.total);
  const oldNominal = toNumSafe(order.nominal_dibayar);

  // ── Kontrak BARU: tambah-bayar ──
  if (body.hasOwnProperty('tambah')) {
    const tambah = toNumSafe(body.tambah);
    const akun = String(body.akun || '').trim();
    const check = validateTambahBayar({ total, oldNominal, tambah, akun });
    if (!check.ok) return res.status(400).json({ status: 'error', message: check.message });
    const keterangan = `Pembayaran tambahan — ${order.nama_produk} (${order.nama_customer})`;
    try {
      await appendLedger(supabase, {
        tipe: 'Masuk',
        sumber: 'Pesanan',
        id_pesanan: id,
        kategori: 'Pembayaran Pesanan',
        keterangan,
        nominal: tambah,
        akun,
      });
      const { error: payErr } = await supabase.from('order_payments').insert({
        id_pesanan: id,
        nominal: tambah,
        akun,
        tipe: oldNominal > 0 ? 'Pelunasan' : 'DP',
        keterangan,
      });
      if (payErr) throw payErr;
    } catch (ledgerErr) {
      return res.status(500).json({ status: 'error', message: 'Gagal mencatat ledger: ' + ledgerErr.message });
    }
    return persistPaidSum(id, total, res);
  }

  // ── Kontrak LEGACY: total baru absolut (diperketat, hapus di F4) ──
  const newNominal = toNumSafe(body.nominal_dibayar);
  const delta = newNominal - oldNominal;
  if (delta === 0) {
    const sisa = total - oldNominal;
    return res.status(200).json({ status: 'success', data: { id, nominal_dibayar: oldNominal, sisa, status_bayar: computeStatusBayar(oldNominal, total) } });
  }
  const akunLegacy = String(body.akun || '').trim();
  if (!akunLegacy) return res.status(400).json({ status: 'error', message: 'Akun wajib diisi untuk setiap pembayaran.' });
  if (newNominal < 0) return res.status(400).json({ status: 'error', message: 'Nominal dibayar tidak boleh negatif.' });
  if (newNominal - total > 0.01) return res.status(400).json({ status: 'error', message: 'Nominal dibayar melebihi total. Tambahkan maksimal sebesar sisa.' });
  const isMasuk = delta > 0;
  const keterangan = `${isMasuk ? 'Pembayaran tambahan' : 'Koreksi pembayaran'} — ${order.nama_produk} (${order.nama_customer})`;
  try {
    await appendLedger(supabase, {
      tipe: isMasuk ? 'Masuk' : 'Keluar',
      sumber: 'Pesanan',
      id_pesanan: id,
      kategori: 'Pembayaran Pesanan',
      keterangan,
      nominal: Math.abs(delta),
      akun: akunLegacy,
    });
    const { error: payErr } = await supabase.from('order_payments').insert({
      id_pesanan: id,
      nominal: delta,
      akun: akunLegacy,
      tipe: isMasuk ? (oldNominal > 0 ? 'Pelunasan' : 'DP') : 'Koreksi',
      keterangan,
    });
    if (payErr) throw payErr;
  } catch (ledgerErr) {
    return res.status(500).json({ status: 'error', message: 'Gagal mencatat ledger: ' + ledgerErr.message });
  }
  return persistPaidSum(id, total, res);
}

/* Void 1 baris cicilan (F3): koreksi full ke akun asal.
   Koreksi sebagian = void lalu tambah baru yang benar. */
async function handleVoidPayment(req, res, id) {
  const body = req.body || {};
  const paymentId = String(body.payment_id || '').trim();
  if (!paymentId) return res.status(400).json({ status: 'error', message: 'payment_id wajib diisi.' });

  const { data: order, error: readErr } = await supabase.from('orders').select('nama_produk,nama_customer,total').eq('id', id).single();
  if (readErr) return res.status(500).json({ status: 'error', message: readErr.message });
  if (!order) return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });

  try {
    await voidOrderPayment(supabase, id, paymentId, `${order.nama_produk} (${order.nama_customer})`);
  } catch (e) {
    return res.status(400).json({ status: 'error', message: e.message });
  }
  return persistPaidSum(id, toNumSafe(order.total), res);
}

/* Tulis ulang nominal_dibayar/sisa/status_bayar dari sum(order_payments) (F1).
   orders.* adalah cache; order_payments adalah kebenaran tunggal. */
async function persistPaidSum(id, total, res) {
  let newNominal;
  try {
    newNominal = await sumOrderPayments(supabase, id);
  } catch (sumErr) {
    return res.status(500).json({ status: 'error', message: 'Gagal menghitung riwayat pembayaran: ' + sumErr.message });
  }
  const sisa = total - newNominal;
  const statusBayar = computeStatusBayar(newNominal, total);
  const { error: updateErr } = await supabase
    .from('orders')
    .update({ nominal_dibayar: newNominal, sisa, status_bayar: statusBayar })
    .eq('id', id);
  if (updateErr) return res.status(500).json({ status: 'error', message: updateErr.message });
  return res.status(200).json({ status: 'success', data: { id, nominal_dibayar: newNominal, sisa, status_bayar: statusBayar } });
}
