import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ status: 'error', message: 'id wajib diisi' });

  if (req.method === 'PUT') {
    const body = req.body || {};
    const updatable = ['nama', 'kategori', 'badge', 'deskripsi', 'harga', 'satuan', 'gambar', 'harga_nama', 'harga_angka', 'harga_nama_angka'];
    const patch = {};
    updatable.forEach((k) => { if (body.hasOwnProperty(k)) patch[k] = body[k]; });

    const { error } = await supabase.from('products').update(patch).eq('id', id);
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id } });
  }

  if (req.method === 'PATCH') {
    // toggle / set status aktif
    const body = req.body || {};
    let newVal;
    if (body.hasOwnProperty('aktif')) {
      newVal = !!body.aktif;
    } else {
      const { data: current, error: readErr } = await supabase.from('products').select('aktif').eq('id', id).single();
      if (readErr) return res.status(500).json({ status: 'error', message: readErr.message });
      newVal = !current.aktif;
    }

    const { error } = await supabase.from('products').update({ aktif: newVal }).eq('id', id);
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id, aktif: newVal } });
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}
