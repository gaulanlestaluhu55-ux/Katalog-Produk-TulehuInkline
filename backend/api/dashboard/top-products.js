import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method not allowed' });

  try {
    const limit = Math.min(parseInt(req.query.limit || '5', 10), 50);
    const range = req.query.range || '12m';

    const since = getSince(range);

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id_produk, nama_produk, qty, total, created_at')
      .gte('created_at', since.toISOString())
      .not('id_produk', 'is', null);
    if (error) throw error;

    const groups = {};
    for (const o of orders) {
      const key = o.id_produk;
      if (!groups[key]) {
        groups[key] = { product_id: key, nama: o.nama_produk, total_qty: 0, total_revenue: 0 };
      }
      groups[key].total_qty += o.qty || 0;
      groups[key].total_revenue += o.total || 0;
    }

    const result = Object.values(groups)
      .sort((a, b) => b.total_qty - a.total_qty)
      .slice(0, limit);

    return res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

function getSince(range) {
  const now = new Date();
  if (range === '6m') now.setMonth(now.getMonth() - 6);
  else if (range === '12m') now.setMonth(now.getMonth() - 12);
  else if (range === '24m') now.setMonth(now.getMonth() - 24);
  else now.setMonth(now.getMonth() - 12);
  return now;
}