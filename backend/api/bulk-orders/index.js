import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';
import { buildBulkOrderPayload } from '../../lib/bulk-orders.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    const [{ data, error }, { data: items, error: itemErr }] = await Promise.all([
      supabase.from('bulk_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('bulk_order_items').select('bulk_order_id,qty'),
    ]);
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    if (itemErr) return res.status(500).json({ status: 'error', message: itemErr.message });
    const qtyByOrder = (items || []).reduce((map, item) => {
      map[item.bulk_order_id] = (map[item.bulk_order_id] || 0) + Number(item.qty || 0);
      return map;
    }, {});
    return res.status(200).json({ status: 'success', data: (data || []).map((order) => ({ ...order, qty_total: qtyByOrder[order.id] || 0 })) });
  }

  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Method not allowed' });

  try {
    const body = req.body || {};
    const productId = String(body.id_produk || '').trim();
    if (!productId) throw new Error('Produk wajib dipilih.');
    const [{ data: product, error: productErr }, { data: accounts, error: accountsErr }] = await Promise.all([
      supabase.from('products').select('id,nama,kategori,harga,sizes,colors').eq('id', productId).single(),
      supabase.from('accounts').select('nama'),
    ]);
    if (productErr || !product) throw new Error('Produk tidak ditemukan.');
    if (accountsErr) throw accountsErr;
    const payload = buildBulkOrderPayload(body, product, (accounts || []).map((account) => account.nama));
    const { data: id, error } = await supabase.rpc('create_bulk_order', { payload });
    if (error) throw error;
    return res.status(200).json({ status: 'success', data: { id } });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message || 'Gagal membuat pesanan massal.' });
  }
}
