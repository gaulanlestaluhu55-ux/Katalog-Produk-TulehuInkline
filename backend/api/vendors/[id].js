import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ status: 'error', message: 'id wajib diisi' });

  if (req.method === 'PUT') {
    const body = req.body || {};
    const patch = {};
    ['nama', 'no_wa', 'catatan'].forEach((k) => { if (body.hasOwnProperty(k)) patch[k] = body[k]; });

    const { error } = await supabase.from('vendors').update(patch).eq('id', id);
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id } });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('vendors').delete().eq('id', id);
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id } });
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}
