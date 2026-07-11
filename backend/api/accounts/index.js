import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('accounts').select('*').order('nama', { ascending: true });
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const nama = (body.nama || '').trim();
    if (!nama) return res.status(400).json({ status: 'error', message: 'Nama akun tidak boleh kosong.' });

    const { data, error } = await supabase.from('accounts').insert({ nama }).select('id, nama').single();
    if (error) {
      if (error.code === '23505') return res.status(400).json({ status: 'error', message: `Akun '${nama}' sudah ada.` });
      return res.status(500).json({ status: 'error', message: error.message });
    }
    return res.status(200).json({ status: 'success', data });
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}
