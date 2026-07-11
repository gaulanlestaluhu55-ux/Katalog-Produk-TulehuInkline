import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';
import { toNumSafe, computeStatusBayar, appendLedger } from '../../lib/helpers.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const total = toNumSafe(body.total);
    const nominalDibayar = toNumSafe(body.nominal_dibayar);
    const sisa = total - nominalDibayar;
    const statusBayar = computeStatusBayar(nominalDibayar, total);

    const { data, error } = await supabase
      .from('orders')
      .insert({
        id_produk: body.id_produk || null,
        nama_produk: body.nama_produk || '',
        kategori: body.kategori || '',
        opsi: body.opsi || '',
        size: body.size || '',
        warna: body.warna || '',
        lengan: body.lengan || '',
        qty: body.qty || 1,
        harga_satuan: body.harga_satuan || 0,
        total,
        nama_customer: body.nama_customer || '',
        kontak: body.kontak || '',
        status: body.status || 'Baru',
        catatan: body.catatan || '',
        status_bayar: statusBayar,
        nominal_dibayar: nominalDibayar,
        sisa,
      })
      .select('id')
      .single();

    if (error) return res.status(500).json({ status: 'error', message: error.message });

    if (nominalDibayar > 0) {
      try {
        await appendLedger(supabase, {
          tipe: 'Masuk',
          sumber: 'Pesanan',
          id_pesanan: data.id,
          kategori: 'Pembayaran Pesanan',
          keterangan: `DP awal — ${body.nama_produk || ''} (${body.nama_customer || ''})`,
          nominal: nominalDibayar,
          akun: body.akun || 'Kas',
        });
      } catch (ledgerErr) {
        // Order-nya udah tersimpan; ledger gagal jangan bikin seluruh request gagal, tapi kasih tau.
        return res.status(200).json({ status: 'success', data: { id: data.id }, warning: 'Order tersimpan tapi ledger keuangan gagal: ' + ledgerErr.message });
      }
    }

    return res.status(200).json({ status: 'success', data: { id: data.id } });
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}
