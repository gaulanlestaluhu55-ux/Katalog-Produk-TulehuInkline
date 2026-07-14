import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method not allowed' });

  try {
    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, nama_produk, nama_customer, total, status, status_bayar, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;

    return res.status(200).json({ status: 'success', data: orders });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}