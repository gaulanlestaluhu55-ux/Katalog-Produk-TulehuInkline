import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method not allowed' });

  try {
    switch (req.query.type) {
      case 'summary': return handleSummary(req, res);
      case 'monthly': return handleMonthly(req, res);
      case 'top-products': return handleTopProducts(req, res);
      case 'recent-orders': return handleRecentOrders(req, res);
      case 'finance': return handleFinance(req, res);
      default: return res.status(400).json({ status: 'error', message: 'Invalid type param' });
    }
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

async function handleSummary(req, res) {
  const range = normalizeRange(req.query.range);
  const current = getRangeBounds(range);
  const previous = getPreviousRangeBounds(range, current);

  const [currentOrders, previousOrders] = await Promise.all([
    loadOrderParents(current),
    loadOrderParents(previous),
  ]);

  return res.status(200).json({
    status: 'success',
    data: {
      range: aggregateOrders(currentOrders),
      previous_range: aggregateOrders(previousOrders),
      range_key: range
    }
  });
}

async function handleMonthly(req, res) {
  const range = normalizeRange(req.query.range);
  const bounds = getRangeBounds(range);

  const orders = await loadOrderParents(bounds);

  const result = buildTimeSeries(range, orders || [], bounds);
  return res.status(200).json({ status: 'success', data: result, meta: { range } });
}

async function handleTopProducts(req, res) {
  const limit = Math.min(parseInt(req.query.limit || '5', 10), 50);
  const range = normalizeRange(req.query.range);
  const bounds = getRangeBounds(range);

  const [{ data: orders, error }, { data: bulkItems, error: bulkErr }] = await Promise.all([
    supabase.from('orders').select('id_produk, nama_produk, kategori, qty, total, created_at').gte('created_at', bounds.start.toISOString()).lt('created_at', bounds.end.toISOString()),
    supabase.from('bulk_order_items').select('id_produk, nama_produk, kategori, qty, total, bulk_orders!inner(created_at)').gte('bulk_orders.created_at', bounds.start.toISOString()).lt('bulk_orders.created_at', bounds.end.toISOString()),
  ]);
  if (error) throw error;
  if (bulkErr && !isMissingBulkSchema(bulkErr)) throw bulkErr;

  const groups = {};
  for (const o of orders || []) {
    const nama = String(o.nama_produk || '').trim();
    if (!nama) continue;
    const key = nama.toLowerCase();
    if (!groups[key]) {
      groups[key] = {
        product_id: o.id_produk || null,
        nama,
        kategori: o.kategori || '-',
        total_qty: 0,
        total_revenue: 0
      };
    }
    groups[key].total_qty += Number(o.qty || 0);
    groups[key].total_revenue += Number(o.total || 0);
    if (!groups[key].product_id && o.id_produk) groups[key].product_id = o.id_produk;
  }
  for (const item of bulkItems || []) {
    addProductAggregate(groups, item);
  }

  const result = Object.values(groups)
    .sort((a, b) => b.total_qty - a.total_qty || b.total_revenue - a.total_revenue)
    .slice(0, limit);

  return res.status(200).json({ status: 'success', data: result });
}

async function handleRecentOrders(req, res) {
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);

  const [{ data: orders, error }, { data: bulkOrders, error: bulkErr }] = await Promise.all([
    supabase.from('orders').select('id, nama_produk, nama_customer, total, status, status_bayar, created_at').order('created_at', { ascending: false }).limit(limit),
    supabase.from('bulk_orders').select('id, nama_produk, nama_customer, total, status, status_bayar, created_at').order('created_at', { ascending: false }).limit(limit),
  ]);
  if (error) throw error;
  if (bulkErr && !isMissingBulkSchema(bulkErr)) throw bulkErr;
  const combined = [...(orders || []), ...(bulkOrders || []).map((order) => ({ ...order, nama_produk: `${order.nama_produk} (Massal)` }))]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
  return res.status(200).json({ status: 'success', data: combined });
}

async function handleFinance(req, res) {
  const range = normalizeRange(req.query.range);
  const bounds = getRangeBounds(range);

  const { data: tx, error } = await supabase
    .from('finance_transactions')
    .select('id, tipe, sumber, kategori, keterangan, nominal, akun, created_at')
    .gte('created_at', bounds.start.toISOString())
    .lt('created_at', bounds.end.toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;

  let total_masuk = 0, total_keluar = 0;
  const per_kategori = {};
  const bulanan = {};
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);

  const operationalTx = (tx || []).filter((t) => t.sumber !== 'Transfer');
  for (const t of operationalTx) {
    const nominal = Number(t.nominal || 0);
    const kat = t.kategori || 'Lainnya';
    if (!per_kategori[kat]) per_kategori[kat] = { kategori: kat, total_masuk: 0, total_keluar: 0 };

    if (t.tipe === 'Keluar') {
      total_keluar += nominal;
      per_kategori[kat].total_keluar += nominal;
    } else {
      total_masuk += nominal;
      per_kategori[kat].total_masuk += nominal;
    }

    const date = new Date(t.created_at);
    const bulan = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!bulanan[bulan]) bulanan[bulan] = { bulan, masuk: 0, keluar: 0 };
    if (t.tipe === 'Keluar') bulanan[bulan].keluar += nominal;
    else bulanan[bulan].masuk += nominal;
  }

  const transaksi = operationalTx.slice(0, limit).map(t => ({
    id: t.id,
    kategori: t.kategori || 'Lainnya',
    keterangan: t.keterangan || '',
    nominal: Number(t.nominal || 0),
    tipe: t.tipe,
    akun: t.akun || 'Kas',
    created_at: t.created_at,
  }));

  return res.status(200).json({
    status: 'success',
    data: {
      total_masuk,
      total_keluar,
      saldo: total_masuk - total_keluar,
      per_kategori: Object.values(per_kategori).sort((a, b) => b.total_keluar - a.total_keluar),
      bulanan: Object.values(bulanan).sort((a, b) => a.bulan.localeCompare(b.bulan)),
      harian: buildFinanceDaily(operationalTx, bounds),
      transaksi,
    }
  });
}

function aggregateOrders(arr) {
  return arr.reduce((a, o) => {
    a.total += orderQty(o);
    a.revenue += Number(o.total || 0);
    const status = normalizeOrderStatus(o.status);
    if (status === 'Baru') a.baru += 1;
    else if (status === 'Diproses') a.diproses += 1;
    else if (status === 'Selesai') a.selesai += 1;
    else if (status === 'Diambil') a.diambil += 1;
    else if (status === 'Batal') a.batal += 1;
    if (o.status_bayar === 'Lunas') a.lunas += 1;
    else if (o.status_bayar === 'DP') a.dp += 1;
    else a.belum_bayar += 1;
    return a;
  }, { total: 0, revenue: 0, baru: 0, diproses: 0, selesai: 0, diambil: 0, batal: 0, lunas: 0, dp: 0, belum_bayar: 0 });
}

async function loadOrderParents(bounds) {
  const [{ data: orders, error }, { data: bulkItems, error: bulkErr }] = await Promise.all([
    supabase.from('orders').select('status, status_bayar, total, created_at, qty').gte('created_at', bounds.start.toISOString()).lt('created_at', bounds.end.toISOString()),
    supabase.from('bulk_order_items').select('bulk_order_id, qty, bulk_orders!inner(status,status_bayar,total,created_at)').gte('bulk_orders.created_at', bounds.start.toISOString()).lt('bulk_orders.created_at', bounds.end.toISOString()),
  ]);
  if (error) throw error;
  if (bulkErr && !isMissingBulkSchema(bulkErr)) throw bulkErr;
  return [...(orders || []), ...aggregateBulkParents(bulkItems || [])];
}

function normalizeOrderStatus(status) {
  if (status === 'Menunggu DP') return 'Baru';
  if (status === 'Siap Produksi') return 'Diproses';
  if (status === 'Selesai Produksi' || status === 'Siap Diambil') return 'Selesai';
  return status;
}

function addProductAggregate(groups, o) {
  const nama = String(o.nama_produk || '').trim();
  if (!nama) return;
  const key = nama.toLowerCase();
  if (!groups[key]) groups[key] = { product_id: o.id_produk || null, nama, kategori: o.kategori || '-', total_qty: 0, total_revenue: 0 };
  groups[key].total_qty += Number(o.qty || 0);
  groups[key].total_revenue += Number(o.total || 0);
  if (!groups[key].product_id && o.id_produk) groups[key].product_id = o.id_produk;
}

function aggregateBulkParents(items) {
  const parents = {};
  for (const item of items) {
    const parentRaw = item.bulk_orders;
    const parent = Array.isArray(parentRaw) ? parentRaw[0] : parentRaw;
    if (!parent || !item.bulk_order_id) continue;
    if (!parents[item.bulk_order_id]) parents[item.bulk_order_id] = { ...parent, qty: 0 };
    parents[item.bulk_order_id].qty += orderQty(item);
  }
  return Object.values(parents);
}

function orderQty(order) {
  return Math.max(0, Number(order.qty || 0));
}

function isMissingBulkSchema(error) {
  return ['42P01', 'PGRST205'].includes(error?.code) || /bulk_order/i.test(String(error?.message || ''));
}

function normalizeRange(range) {
  return ['1d', '1m', '12m'].includes(range) ? range : '12m';
}

function getRangeBounds(range) {
  const now = new Date();
  const end = new Date(now);
  let start = new Date(now);

  if (range === '1d') {
    start.setHours(0, 0, 0, 0);
  } else if (range === '1m') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 1);
    end.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

function getPreviousRangeBounds(range, current) {
  const end = new Date(current.start);
  const start = new Date(current.start);

  if (range === '1d') {
    start.setDate(start.getDate() - 1);
  } else if (range === '1m') {
    start.setMonth(start.getMonth() - 1);
  } else {
    start.setFullYear(start.getFullYear() - 1);
  }

  return { start, end };
}

function buildTimeSeries(range, orders, bounds) {
  if (range === '1d') return buildHourlySeries(orders, bounds);
  if (range === '1m') return buildDailySeries(orders, bounds);
  return buildMonthlySeries(orders, bounds);
}

function buildHourlySeries(orders, bounds) {
  const groups = {};
  for (let hour = 0; hour < 24; hour += 1) {
    const key = String(hour).padStart(2, '0');
    groups[key] = { bucket: key, orders: 0, revenue: 0 };
  }

  for (const o of orders) {
    const date = new Date(o.created_at);
    const key = String(date.getHours()).padStart(2, '0');
    groups[key].orders += orderQty(o);
    groups[key].revenue += Number(o.total || 0);
  }

  return Object.values(groups);
}

function buildDailySeries(orders, bounds) {
  const groups = {};
  const current = new Date(bounds.start);
  while (current < bounds.end) {
    const key = toDateKey(current);
    groups[key] = { bucket: key, orders: 0, revenue: 0 };
    current.setDate(current.getDate() + 1);
  }

  for (const o of orders) {
    const key = toDateKey(new Date(o.created_at));
    if (!groups[key]) groups[key] = { bucket: key, orders: 0, revenue: 0 };
    groups[key].orders += orderQty(o);
    groups[key].revenue += Number(o.total || 0);
  }

  return Object.values(groups);
}

function buildMonthlySeries(orders, bounds) {
  const groups = {};
  const current = new Date(bounds.start);
  while (current < bounds.end) {
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
    groups[key] = { bucket: key, orders: 0, revenue: 0 };
    current.setMonth(current.getMonth() + 1);
  }

  for (const o of orders) {
    const date = new Date(o.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!groups[key]) groups[key] = { bucket: key, orders: 0, revenue: 0 };
    groups[key].orders += orderQty(o);
    groups[key].revenue += Number(o.total || 0);
  }

  return Object.values(groups);
}

/* Series harian masuk/keluar dalam bounds (zero-filled per tanggal).
   Pure function — diekspor agar bisa di-unit-test. */
export function buildFinanceDaily(tx, bounds) {
  const groups = {};
  const current = new Date(bounds.start);
  while (current < bounds.end) {
    const key = toDateKey(current);
    groups[key] = { tanggal: key, masuk: 0, keluar: 0 };
    current.setDate(current.getDate() + 1);
  }

  for (const t of tx || []) {
    const key = toDateKey(new Date(t.created_at));
    if (!groups[key]) groups[key] = { tanggal: key, masuk: 0, keluar: 0 };
    const nominal = Number(t.nominal || 0);
    if (t.tipe === 'Keluar') groups[key].keluar += nominal;
    else groups[key].masuk += nominal;
  }

  return Object.values(groups);
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
