import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';
import { randomUUID } from 'node:crypto';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ status: 'error', message: 'id wajib diisi' });

  if (req.method === 'PUT' && req.query.action === 'void-transfer') {
    return voidTransfer(res, id);
  }

  if (req.method === 'DELETE') {
    const { data: tx, error: readErr } = await supabase.from('finance_transactions').select('sumber').eq('id', id).single();
    if (readErr) return res.status(500).json({ status: 'error', message: readErr.message });
    if (!tx) return res.status(404).json({ status: 'error', message: 'Transaksi tidak ditemukan' });

    if (tx.sumber === 'Pesanan') {
      return res.status(400).json({ status: 'error', message: 'Transaksi dari pesanan gak bisa dihapus langsung di sini. Koreksi lewat update pembayaran di pesanan.' });
    }
    if (tx.sumber === 'Transfer') {
      return res.status(400).json({ status: 'error', message: 'Transfer tidak bisa dihapus satu sisi. Gunakan Batalkan Transfer.' });
    }

    const { error } = await supabase.from('finance_transactions').delete().eq('id', id);
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id } });
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}

async function voidTransfer(res, id) {
  const { data: selected, error: selectedErr } = await supabase
    .from('finance_transactions').select('*').eq('id', id).single();
  if (selectedErr) return res.status(500).json({ status: 'error', message: selectedErr.message });
  if (!selected || selected.sumber !== 'Transfer' || !selected.transfer_id) {
    return res.status(400).json({ status: 'error', message: 'Transaksi ini bukan transfer yang dapat dibatalkan.' });
  }
  if (selected.transfer_reversal_of) {
    return res.status(400).json({ status: 'error', message: 'Baris koreksi transfer tidak dapat dibatalkan lagi.' });
  }
  const { data: existing, error: existingErr } = await supabase
    .from('finance_transactions').select('id').eq('transfer_reversal_of', selected.transfer_id).limit(1);
  if (existingErr) return res.status(500).json({ status: 'error', message: existingErr.message });
  if ((existing || []).length) return res.status(400).json({ status: 'error', message: 'Transfer ini sudah dibatalkan.' });

  const { data: rows, error: rowsErr } = await supabase
    .from('finance_transactions').select('*').eq('transfer_id', selected.transfer_id);
  if (rowsErr) return res.status(500).json({ status: 'error', message: rowsErr.message });
  if ((rows || []).length !== 2) return res.status(400).json({ status: 'error', message: 'Pasangan transfer tidak lengkap.' });

  const reversalId = randomUUID();
  const { error: insertErr } = await supabase.from('finance_transactions').insert(rows.map((row) => ({
    tipe: row.tipe === 'Keluar' ? 'Masuk' : 'Keluar',
    sumber: 'Transfer',
    kategori: 'Koreksi Transfer',
    keterangan: `Koreksi transfer: ${row.keterangan || row.akun}`,
    nominal: row.nominal,
    akun: row.akun,
    akun_lawan: row.akun_lawan || '',
    transfer_id: reversalId,
    transfer_reversal_of: selected.transfer_id,
  })));
  if (insertErr) return res.status(500).json({ status: 'error', message: insertErr.message });
  return res.status(200).json({ status: 'success', data: { transfer_id: selected.transfer_id, reversal_id: reversalId } });
}
