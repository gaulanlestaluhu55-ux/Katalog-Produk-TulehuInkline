import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';
import { toNumSafe } from '../../lib/helpers.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('finance_transactions').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const tipe = body.tipe === 'Keluar' ? 'Keluar' : 'Masuk';
    const nominal = Math.abs(toNumSafe(body.nominal));
    if (nominal <= 0) return res.status(400).json({ status: 'error', message: 'Nominal harus lebih dari 0.' });

    const { data, error } = await supabase
      .from('finance_transactions')
      .insert({
        tipe,
        sumber: 'Manual',
        id_pesanan: null,
        kategori: body.kategori || '',
        keterangan: body.keterangan || '',
        nominal,
        akun: body.akun || 'Kas',
      })
      .select('id')
      .single();

    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id: data.id } });
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}
