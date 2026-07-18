import { supabase } from '../../lib/supabase.js';
import { handleCors, isAdmin, requireAdmin } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'GET') {
    const admin = isAdmin(req);
    let query = supabase.from('products').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: true });
    if (!admin) query = query.eq('aktif', true);

    const { data, error } = await query;
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data });
  }

  if (req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const body = req.body || {};
    const nama = String(body.nama || '').trim();
    const kategori = String(body.kategori || '').trim();
    const harga = Math.max(0, Number(body.harga) || 0);
    if (!nama) return res.status(400).json({ status: 'error', message: 'Nama produk wajib diisi.' });
    if (!kategori) return res.status(400).json({ status: 'error', message: 'Kategori wajib diisi.' });

    const { data, error } = await supabase
      .from('products')
      .insert({
        nama,
        kategori,
        badge: String(body.badge || '').trim(),
        deskripsi: String(body.deskripsi || '').trim(),
        harga,
        satuan: String(body.satuan || '/pcs').trim() || '/pcs',
        gambar: String(body.gambar || '').trim(),
        harga_nama: Math.max(0, Number(body.harga_nama) || 0),
        harga_angka: Math.max(0, Number(body.harga_angka) || 0),
        harga_nama_angka: Math.max(0, Number(body.harga_nama_angka) || 0),
        aktif: true,
      })
      .select('id')
      .single();

    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id: data.id } });
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}
