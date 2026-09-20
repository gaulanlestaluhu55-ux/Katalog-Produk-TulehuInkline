import { supabase } from '../../lib/supabase.js';
import { handleCors, requireAdmin } from '../../lib/auth.js';
import { toNumSafe } from '../../lib/helpers.js';
import { randomUUID } from 'node:crypto';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('finance_transactions').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (req.query.action === 'transfer') return handleTransfer(body, res);
    const tipe = body.tipe === 'Keluar' ? 'Keluar' : 'Masuk';
    const nominal = Math.abs(toNumSafe(body.nominal));
    if (nominal <= 0) return res.status(400).json({ status: 'error', message: 'Nominal harus lebih dari 0.' });

    const { data, error } = await supabase
      .from('finance_transactions')
      .insert({
        tipe,
        sumber: 'Manual',
        id_pesanan: null,
        kategori: body.kategori || '',
        keterangan: body.keterangan || '',
        nominal,
        akun: body.akun || 'Kas',
      })
      .select('id')
      .single();

    if (error) return res.status(500).json({ status: 'error', message: error.message });
    return res.status(200).json({ status: 'success', data: { id: data.id } });
  }

  res.status(405).json({ status: 'error', message: 'Method not allowed' });
}

async function handleTransfer(body, res) {
  const akunSumber = String(body.akun_sumber || '').trim();
  const akunTujuan = String(body.akun_tujuan || '').trim();
  const nominal = Math.abs(toNumSafe(body.nominal));
  const tanggal = String(body.tanggal || '').trim();
  if (!akunSumber || !akunTujuan) return res.status(400).json({ status: 'error', message: 'Akun sumber dan tujuan wajib diisi.' });
  if (akunSumber === akunTujuan) return res.status(400).json({ status: 'error', message: 'Akun sumber dan tujuan harus berbeda.' });
  if (nominal <= 0) return res.status(400).json({ status: 'error', message: 'Nominal harus lebih dari 0.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return res.status(400).json({ status: 'error', message: 'Tanggal transfer tidak valid.' });

  const { data: accounts, error: accountErr } = await supabase.from('accounts').select('nama').in('nama', [akunSumber, akunTujuan]);
  if (accountErr) return res.status(500).json({ status: 'error', message: accountErr.message });
  if ((accounts || []).length !== 2) return res.status(400).json({ status: 'error', message: 'Akun transfer tidak ditemukan.' });

  const transferId = randomUUID();
  const createdAt = `${tanggal}T12:00:00.000Z`;
  const note = String(body.keterangan || '').trim();
  const label = note || `Transfer ${akunSumber} ke ${akunTujuan}`;
  const { error } = await supabase.from('finance_transactions').insert([
    { tipe: 'Keluar', sumber: 'Transfer', kategori: 'Transfer Dana', keterangan: label, nominal, akun: akunSumber, akun_lawan: akunTujuan, transfer_id: transferId, created_at: createdAt },
    { tipe: 'Masuk', sumber: 'Transfer', kategori: 'Transfer Dana', keterangan: label, nominal, akun: akunTujuan, akun_lawan: akunSumber, transfer_id: transferId, created_at: createdAt },
  ]);
  if (error) return res.status(500).json({ status: 'error', message: error.message });
  return res.status(200).json({ status: 'success', data: { transfer_id: transferId } });
}
