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
    const namaProduk = String(body.nama_produk || '').trim();
    const namaCustomer = String(body.nama_customer || '').trim();
    const kategori = String(body.kategori || '').trim();
    const qty = Math.max(1, Math.floor(toNumSafe(body.qty) || 1));
    const hargaSatuan = Math.max(0, toNumSafe(body.harga_satuan));
    const total = Math.max(0, toNumSafe(body.total));
    const nominalDibayar = Math.max(0, toNumSafe(body.nominal_dibayar));
    if (!namaProduk) return res.status(400).json({ status: 'error', message: 'Nama produk wajib diisi.' });
    if (!namaCustomer) return res.status(400).json({ status: 'error', message: 'Nama customer wajib diisi.' });
    if (!kategori) return res.status(400).json({ status: 'error', message: 'Kategori wajib diisi.' });
    if (nominalDibayar > total) return res.status(400).json({ status: 'error', message: 'Nominal dibayar tidak boleh lebih besar dari total.' });
    const sisa = total - nominalDibayar;
    const statusBayar = computeStatusBayar(nominalDibayar, total);

    const { data, error } = await supabase
      .from('orders')
      .insert({
        id_produk: body.id_produk || null,
        nama_produk: namaProduk,
        kategori,
        opsi: String(body.opsi || '').trim(),
        size: String(body.size || '').trim(),
        warna: String(body.warna || '').trim(),
        lengan: String(body.lengan || '').trim(),
        qty,
        harga_satuan: hargaSatuan,
        total,
        nama_customer: namaCustomer,
        kontak: String(body.kontak || '').trim(),
        status: String(body.status || 'Baru').trim() || 'Baru',
        catatan: String(body.catatan || '').trim(),
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
