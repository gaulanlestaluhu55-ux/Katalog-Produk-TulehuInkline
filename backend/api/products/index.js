import { supabase } from '../../lib/supabase.js';
import { handleCors, isAdmin, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'GET') {
    const admin = isAdmin(req);
    let query = supabase.from('products').select('*').order('created_at', { ascending: true });
    if (!admin) query = query.eq('aktif', true);

    const { data, error } = await query;
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data });
  }

  if (req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};

    const { data, error } = await supabase
      .from('products')
      .insert({
        nama: body.nama || '',
        kategori: body.kategori || '',
        badge: body.badge || '',
        deskripsi: body.deskripsi || '',
        harga: body.harga || 0,
        satuan: body.satuan || '/pcs',
        gambar: body.gambar || '',
        harga_nama: body.harga_nama || 0,
        harga_angka: body.harga_angka || 0,
        harga_nama_angka: body.harga_nama_angka || 0,
        aktif: true,
      })
      .select('id')
      .single();

    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id: data.id } });
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}
