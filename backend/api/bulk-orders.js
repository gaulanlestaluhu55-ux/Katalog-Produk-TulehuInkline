import { handleMcpStatus } from '../lib/mcp-order-status.js';
import { supabase } from '../lib/supabase.js';
import { handleCors, requireAdmin } from '../lib/auth.js';
import { buildBulkOrderPayload, BULK_ORDER_STATUSES, getBulkBusinessRules, validateBulkPreviewInput, previewBulkOrder } from '../lib/bulk-orders.js';
import { toNumSafe } from '../lib/helpers.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  const id = String(req.query.id || '').trim();
  if (id) return handleById(req, res, id);
  if (req.method === 'GET' && req.query.action === 'mcp-rules') return res.status(200).json({status:'success',data:getBulkBusinessRules()});
  // PATCH is intentional: an older deployment returns 405 instead of creating an order.
  if (req.method === 'PATCH' && req.query.action === 'mcp-preview') return handlePreview(req,res);
  if (req.method === 'GET') return listOrders(res);
  if (req.method === 'POST') return createOrder(req, res);
  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
}

async function listOrders(res) {
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

async function createOrder(req, res) {
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

async function handleById(req, res, id) {
  const action = String(req.query.action || '').trim();
  if (req.method === 'PATCH' && action === 'mcp-status-audited') return handleMcpStatus(supabase, 'bulk', id, req, res);
  if (req.method === 'GET') return getDetails(res, id, action);
  if (req.method === 'PUT' && action === 'payment') return addPayment(req, res, id);
  if (req.method === 'PUT' && action === 'void-payment') return voidPayment(req, res, id);
  if (req.method === 'PUT' && action === 'status') return updateStatus(req, res, id);
  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
}

async function getDetails(res, id, action) {
  if (action === 'payments') {
    const { data, error } = await supabase.from('bulk_order_payments').select('*').eq('bulk_order_id', id).order('created_at', { ascending: true });
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: data || [] });
  }
  const [{ data: order, error: orderErr }, { data: items, error: itemErr }] = await Promise.all([
    supabase.from('bulk_orders').select('*').eq('id', id).single(),
    supabase.from('bulk_order_items').select('*').eq('bulk_order_id', id).order('warna').order('lengan').order('size'),
  ]);
  if (orderErr || !order) return res.status(404).json({ status: 'error', message: orderErr?.message || 'Pesanan massal tidak ditemukan.' });
  if (itemErr) return res.status(500).json({ status: 'error', message: itemErr.message });
  return res.status(200).json({ status: 'success', data: { ...order, items: items || [] } });
}

async function addPayment(req, res, id) {
  const body = req.body || {};
  const nominal = toNumSafe(body.tambah);
  const akun = String(body.akun || '').trim();
  if (!(nominal > 0) || !akun) return res.status(400).json({ status: 'error', message: 'Nominal dan akun pembayaran wajib diisi.' });
  const { data: account } = await supabase.from('accounts').select('nama').eq('nama', akun).maybeSingle();
  if (!account) return res.status(400).json({ status: 'error', message: 'Akun pembayaran tidak valid.' });
  const { data, error } = await supabase.rpc('append_bulk_order_payment', { p_order_id: id, p_nominal: nominal, p_akun: akun, p_keterangan: String(body.keterangan || '').trim() });
  if (error) return res.status(400).json({ status: 'error', message: error.message });
  return res.status(200).json({ status: 'success', data });
}

async function voidPayment(req, res, id) {
  const paymentId = String((req.body || {}).payment_id || '').trim();
  if (!paymentId) return res.status(400).json({ status: 'error', message: 'payment_id wajib diisi.' });
  const { data, error } = await supabase.rpc('void_bulk_order_payment', { p_order_id: id, p_payment_id: paymentId });
  if (error) return res.status(400).json({ status: 'error', message: error.message });
  return res.status(200).json({ status: 'success', data });
}

async function updateStatus(req, res, id) {
  const status = String((req.body || {}).status || '').trim();
  if (!BULK_ORDER_STATUSES.includes(status)) return res.status(400).json({ status: 'error', message: 'Status pesanan massal tidak valid.' });
  const { data, error } = await supabase.rpc('set_bulk_order_status', { p_order_id: id, p_status: status });
  if (error) return res.status(400).json({ status: 'error', message: error.message });
  return res.status(200).json({ status: 'success', data });
}

async function handlePreview(req,res) {
  let input;
  try {input=validateBulkPreviewInput(req.body);}
  catch(error){return res.status(400).json({status:'error',message:error.message});}
  try {
    const {data:product,error}=await supabase.from('products').select('id,nama,kategori,harga,sizes,colors,aktif').eq('id',input.id_produk).maybeSingle();
    if(error) return res.status(500).json({status:'error',message:'Gagal membaca produk.'});
    if(!product || product.aktif!==true) return res.status(404).json({status:'error',message:'Produk aktif tidak ditemukan.'});
    try {return res.status(200).json({status:'success',data:previewBulkOrder(input,product)});}
    catch(error){return res.status(400).json({status:'error',message:error.message});}
  } catch {return res.status(500).json({status:'error',message:'Simulasi harga gagal.'});}
}