import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method not allowed' });

  try {
    const range = req.query.range || '12m';
    const since = getSince(range);

    // Total orders & revenue in range
    const { data: allOrders, error: ordersErr } = await supabase
      .from('orders')
      .select('status, status_bayar, total, created_at')
      .gte('created_at', since.toISOString());
    if (ordersErr) throw ordersErr;

    // This month orders & revenue
    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);
    const { data: thisMonthOrders, error: thisMonthErr } = await supabase
      .from('orders')
      .select('status, status_bayar, total, created_at')
      .gte('created_at', thisMonthStart.toISOString());
    if (thisMonthErr) throw thisMonthErr;

    // Last month orders & revenue
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

    const rangeAgg = agg(allOrders || []);
    const thisMonthAgg = agg(thisMonthOrders || []);
    const lastMonthAgg = agg(lastMonthOrders || []);

    return res.status(200).json({
      status: 'success',
      data: {
        range: rangeAgg,
        this_month: thisMonthAgg,
        last_month: lastMonthAgg
      }
    });
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