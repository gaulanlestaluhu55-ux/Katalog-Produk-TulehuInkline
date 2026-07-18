import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ status: 'error', message: 'id wajib diisi' });

  if (req.method === 'PUT') {
    const body = req.body || {};
    const updatable = ['nama', 'kategori', 'badge', 'deskripsi', 'satuan', 'gambar', 'pinned'];
    const numericFields = ['harga', 'harga_nama', 'harga_angka', 'harga_nama_angka'];
    const patch = {};
    updatable.forEach((k) => { if (body.hasOwnProperty(k)) patch[k] = body[k]; });
    numericFields.forEach((k) => { if (body.hasOwnProperty(k)) patch[k] = Math.max(0, Number(body[k]) || 0); });

    const { error } = await supabase.from('products').update(patch).eq('id', id);
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id } });
  }

  if (req.method === 'PATCH') {
    const body = req.body || {};
    const patch = {};

    if (body.hasOwnProperty('pinned')) {
      patch.pinned = !!body.pinned;
    }

    if (body.hasOwnProperty('aktif')) {
      patch.aktif = !!body.aktif;
    } else if (!body.hasOwnProperty('pinned')) {
      // backward compat: toggle aktif
      const { data: current, error: readErr } = await supabase.from('products').select('aktif').eq('id', id).single();
      if (readErr) return res.status(500).json({ status: 'error', message: readErr.message });
      patch.aktif = !current.aktif;
    }

    const { error } = await supabase.from('products').update(patch).eq('id', id);
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id, ...patch } });
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}
