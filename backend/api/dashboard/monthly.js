import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method not allowed' });

  try {
    const range = req.query.range || '12m';
    const since = getSince(range);

    const { data: orders, error } = await supabase
      .from('orders')
      .select('total, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: true });
    if (error) throw error;

    // Group by month
    const months = {};
    for (const o of orders) {
      const date = new Date(o.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!months[key]) months[key] = { month: key, orders: 0, revenue: 0 };
      months[key].orders += 1;
      months[key].revenue += Number(o.total || 0);
    }

    // Fill missing months with zeros
    const result = [];
    const start = new Date(since);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date();

    const current = new Date(start);
    while (current <= end) {
      const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      result.push(months[key] || { month: key, orders: 0, revenue: 0 });
      current.setMonth(current.getMonth() + 1);
    }

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