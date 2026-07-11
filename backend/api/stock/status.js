import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method not allowed' });

  const body = req.body || {};
  if (!body.key) return res.status(400).json({ status: 'error', message: 'key wajib diisi' });

  const { data: existing } = await supabase.from('stock_vendor_status').select('*').eq('key', body.key).maybeSingle();

  if (!existing) {
    const { error } = await supabase.from('stock_vendor_status').insert({
      key: body.key,
      jenis: body.jenis || '',
      size: body.size || '',
      warna: body.warna || '',
      lengan: body.lengan || '',
      status: body.status || 'Belum Dipesan',
      vendor_id: body.vendor_id || null,
      updated_at: new Date().toISOString(),
    });
    if (error) return res.status(500).json({ status: 'error', message: error.message });
  } else {
    const patch = { updated_at: new Date().toISOString() };
    if (body.hasOwnProperty('status')) patch.status = body.status;
    if (body.hasOwnProperty('vendor_id')) patch.vendor_id = body.vendor_id || null;

    const { error } = await supabase.from('stock_vendor_status').update(patch).eq('key', body.key);
    if (error) return res.status(500).json({ status: 'error', message: error.message });
  }

  return res.status(200).json({ status: 'success', data: { key: body.key, status: body.status, vendor_id: body.vendor_id } });
}
