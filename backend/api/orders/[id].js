import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';
import { toNumSafe, computeStatusBayar, appendLedger } from '../../lib/helpers.js';

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

  if (req.method === 'PUT' && action === 'payment') {
    return handleUpdatePayment(req, res, id);
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

  // Reversal otomatis kalau dibatalkan & sempat ada pembayaran. Reversal di-tag ke akun "Kas"
  // secara default (sistem gak nyimpen riwayat per-akun dari pembayaran cicilan) — koreksi
  // manual di Keuangan kalau aslinya masuk ke akun lain.
  if (newStatus === 'Batal' && toNumSafe(order.nominal_dibayar) > 0) {
    try {
      await appendLedger(supabase, {
        tipe: 'Keluar',
        sumber: 'Pesanan',
        id_pesanan: id,
        kategori: 'Pembatalan Pesanan',
        keterangan: `Reversal pembayaran — ${order.nama_produk} (${order.nama_customer}) dibatalkan`,
        nominal: toNumSafe(order.nominal_dibayar),
        akun: 'Kas',
      });
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

async function handleUpdatePayment(req, res, id) {
  const body = req.body || {};

  const { data: order, error: readErr } = await supabase.from('orders').select('*').eq('id', id).single();
  if (readErr) return res.status(500).json({ status: 'error', message: readErr.message });
  if (!order) return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });

  const total = toNumSafe(order.total);
  const oldNominal = toNumSafe(order.nominal_dibayar);
  const newNominal = toNumSafe(body.nominal_dibayar);
  const delta = newNominal - oldNominal;

  if (delta !== 0) {
    try {
      await appendLedger(supabase, {
        tipe: delta > 0 ? 'Masuk' : 'Keluar',
        sumber: 'Pesanan',
        id_pesanan: id,
        kategori: 'Pembayaran Pesanan',
        keterangan: `${delta > 0 ? 'Pembayaran tambahan' : 'Koreksi pembayaran'} — ${order.nama_produk} (${order.nama_customer})`,
        nominal: Math.abs(delta),
        akun: body.akun || 'Kas',
      });
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
