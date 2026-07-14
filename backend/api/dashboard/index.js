import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method not allowed' });

  try {
    switch (req.query.type) {
      case 'summary':     return handleSummary(req, res);
      case 'monthly':     return handleMonthly(req, res);
      case 'top-products': return handleTopProducts(req, res);
      case 'recent-orders': return handleRecentOrders(req, res);
      default: return res.status(400).json({ status: 'error', message: 'Invalid type param' });
    }
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

/* ─── Summary KPI ─── */
async function handleSummary(req, res) {
  const range = req.query.range || '12m';
  const since = getSince(range);

  const { data: allOrders, error: ordersErr } = await supabase
    .from('orders')
    .select('status, status_bayar, total, created_at')
    .gte('created_at', since.toISOString());
  if (ordersErr) throw ordersErr;

  const thisMonthStart = new Date();
  thisMonthStart.setDate(1);
  thisMonthStart.setHours(0, 0, 0, 0);
  const { data: thisMonthOrders, error: thisMonthErr } = await supabase
    .from('orders')
    .select('status, status_bayar, total, created_at')
    .gte('created_at', thisMonthStart.toISOString());
  if (thisMonthErr) throw thisMonthErr;

  const lastMonthStart = new Date(thisMonthStart);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  const { data: lastMonthOrders, error: lastMonthErr } = await supabase
    .from('orders')
    .select('status, status_bayar, total, created_at')
    .gte('created_at', lastMonthStart.toISOString())
    .lt('created_at', thisMonthStart.toISOString());
  if (lastMonthErr) throw lastMonthErr;

  const agg = (arr) => arr.reduce((a, o) => {
    a.total += 1;
    a.revenue += Number(o.total || 0);
    if (o.status === 'Baru') a.baru += 1;
    else if (o.status === 'Diproses') a.diproses += 1;
    else if (o.status === 'Selesai') a.selesai += 1;
    else if (o.status === 'Diambil') a.diambil += 1;
    else if (o.status === 'Batal') a.batal += 1;
    if (o.status_bayar === 'Lunas') a.lunas += 1;
    else if (o.status_bayar === 'DP') a.dp += 1;
    else a.belum_bayar += 1;
    return a;
  }, { total: 0, revenue: 0, baru: 0, diproses: 0, selesai: 0, diambil: 0, batal: 0, lunas: 0, dp: 0, belum_bayar: 0 });

  return res.status(200).json({
    status: 'success',
    data: {
      range: agg(allOrders || []),
      this_month: agg(thisMonthOrders || []),
      last_month: agg(lastMonthOrders || [])
    }
  });
}

/* ─── Monthly Chart ─── */
async function handleMonthly(req, res) {
  const range = req.query.range || '12m';
  const since = getSince(range);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('total, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });
  if (error) throw error;

  const months = {};
  for (const o of orders) {
    const date = new Date(o.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!months[key]) months[key] = { month: key, orders: 0, revenue: 0 };
    months[key].orders += 1;
    months[key].revenue += Number(o.total || 0);
  }

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
}

/* ─── Top Products ─── */
async function handleTopProducts(req, res) {
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
}

/* ─── Recent Orders ─── */
async function handleRecentOrders(req, res) {
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, nama_produk, nama_customer, total, status, status_bayar, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return res.status(200).json({ status: 'success', data: orders });
}

/* ─── Helper ─── */
function getSince(range) {
  const now = new Date();
  if (range === '6m') now.setMonth(now.getMonth() - 6);
  else if (range === '12m') now.setMonth(now.getMonth() - 12);
  else if (range === '24m') now.setMonth(now.getMonth() - 24);
  else now.setMonth(now.getMonth() - 12);
  return now;
}
