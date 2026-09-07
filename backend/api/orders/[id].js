import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';
import { toNumSafe, computeStatusBayar, appendLedger, reversePaymentsToLedger, normVariant } from '../../lib/helpers.js';

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

  const qty = Math.max(1, Math.floor(toNumSafe(body.qty) || 1));
  const hargaSatuan = Math.max(0, toNumSafe(body.harga_satuan));
  const total = Math.max(0, toNumSafe(body.total));
  if (Math.abs(total - hargaSatuan * qty) > 0.01) {
    return res.status(400).json({ status: 'error', message: 'Total tidak cocok dengan harga_satuan x qty.' });
  }
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
    sisa,
    status_bayar: computeStatusBayar(dibayar, total),
  };

  const { error: updateErr } = await supabase.from('orders').update(patch).eq('id', id);
  if (updateErr) return res.status(500).json({ status: 'error', message: updateErr.message });

  return res.status(200).json({ status: 'success', data: { id, ...patch } });
}

async function handleUpdatePayment(req, res, id) {
  const body = req.body || {};

  const { data: order, error: readErr } = await supabase.from('orders').select('*').eq('id', id).single();
  if (readErr) return res.status(500).json({ status: 'error', message: readErr.message });
  if (!order) return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });

  const total = toNumSafe(order.total);
  const oldNominal = toNumSafe(order.nominal_dibayar);
  const newNominal = toNumSafe(body.nominal_dibayar);
  const delta = newNominal - oldNominal;

  // Sejak B2: tiap delta dicatat juga ke order_payments (riwayat per cicilan/akun).
  if (delta !== 0) {
    const akun = body.akun || 'Kas';
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
        akun,
      });
      const { error: payErr } = await supabase.from('order_payments').insert({
        id_pesanan: id,
        nominal: delta,
        akun,
        tipe: isMasuk ? (oldNominal > 0 ? 'Pelunasan' : 'DP') : 'Koreksi',
        keterangan,
      });
      if (payErr) throw payErr;
    } catch (ledgerErr) {
      return res.status(500).json({ status: 'error', message: 'Gagal mencatat ledger: ' + ledgerErr.message });
    }
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
