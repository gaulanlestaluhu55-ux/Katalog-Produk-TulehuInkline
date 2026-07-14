import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';
import { toNumSafe, ACTIVE_ORDER_STATUSES } from '../../lib/helpers.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  if (req.method === 'POST' && req.query.action === 'status') return handleStatusPost(req, res);
  if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Method not allowed' });

  // 1. Ambil semua pesanan aktif (Baru/Diproses) yang punya varian size/warna
  const { data: orders, error: ordersErr } = await supabase
    .from('orders')
    .select('kategori, size, warna, lengan, qty, status')
    .in('status', ACTIVE_ORDER_STATUSES);
  if (ordersErr) return res.status(500).json({ status: 'error', message: ordersErr.message });

  // 2. Agregasi di JS, dikelompokkan per jenis+size+warna+lengan
  const groups = {};
  for (const o of orders) {
    const size = o.size || '';
    const warna = o.warna || '';
    const lengan = o.lengan || '';
    if (!size && !warna) continue;

    const jenis = o.kategori || '-';
    const key = `${jenis}|${size}|${warna}|${lengan}`;
    if (!groups[key]) groups[key] = { key, jenis, size, warna, lengan, qty: 0 };
    groups[key].qty += toNumSafe(o.qty);
  }

  // 3. Gabung sama status checklist + vendor
  const { data: statusRows, error: statusErr } = await supabase.from('stock_vendor_status').select('*');
  if (statusErr) return res.status(500).json({ status: 'error', message: statusErr.message });

  const { data: vendors, error: vendorErr } = await supabase.from('vendors').select('id, nama, no_wa');
  if (vendorErr) return res.status(500).json({ status: 'error', message: vendorErr.message });
  const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v]));

  const statusMap = Object.fromEntries(statusRows.map((s) => [s.key, s]));

  let result = Object.values(groups).map((g) => {
    const st = statusMap[g.key] || { status: 'Belum Dipesan', vendor_id: null };
    const vendor = st.vendor_id ? vendorMap[st.vendor_id] : null;
    return {
      ...g,
      status: st.status || 'Belum Dipesan',
      vendor_id: st.vendor_id || '',
      vendor_nama: vendor ? vendor.nama : '',
      vendor_wa: vendor ? vendor.no_wa : '',
    };
  });

  result.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'Belum Dipesan' ? -1 : 1;
    return (a.jenis + a.size + a.warna + a.lengan).localeCompare(b.jenis + b.size + b.warna + b.lengan);
  });

  return res.status(200).json({ status: 'success', data: result });
}

async function handleStatusPost(req, res) {
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
