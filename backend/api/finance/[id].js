import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ status: 'error', message: 'id wajib diisi' });

  if (req.method === 'DELETE') {
    const { data: tx, error: readErr } = await supabase.from('finance_transactions').select('sumber').eq('id', id).single();
    if (readErr) return res.status(500).json({ status: 'error', message: readErr.message });
    if (!tx) return res.status(404).json({ status: 'error', message: 'Transaksi tidak ditemukan' });

    if (tx.sumber === 'Pesanan') {
      return res.status(400).json({ status: 'error', message: 'Transaksi dari pesanan gak bisa dihapus langsung di sini. Koreksi lewat update pembayaran di pesanan.' });
    }

    const { error } = await supabase.from('finance_transactions').delete().eq('id', id);
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id } });
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}
