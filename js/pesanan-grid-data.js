/* ═══════════════════════════════════════════════════════
   PESANAN GRID — data layer (fase 2: + akun terakhir per order)
   Tanggung jawab: state + fetch + parse opsi + opsi dropdown akun/status.
   DOM edit ada di pesanan-grid-edit.js; render di pesanan-grid-render.js.
   ═══════════════════════════════════════════════════════ */
window.GridApp = window.GridApp || {};

GridApp.state = { products: [], orders: [], accounts: [], finance: [], lastAkunByOrder: {}, filter: 'semua' };
GridApp.STATUS_LIST = ['Baru', 'Diproses', 'Selesai', 'Diambil', 'Batal'];

GridApp.authHeaders = function (json) {
  const h = { Authorization: `Bearer ${window.adminToken}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

async function gridGetJson(path) {
  const res = await apiFetch(`${CONFIG.apiUrl}${path}`, { headers: GridApp.authHeaders() });
  return res.json();
}

/* Ambil products + accounts + orders + finance paralel. Throw kalau ada yang gagal. */
GridApp.fetchAll = async function () {
  const [prodJson, accJson, ordJson, finJson] = await Promise.all([
    gridGetJson('/api/products'),
    gridGetJson('/api/accounts'),
    gridGetJson('/api/orders'),
    gridGetJson('/api/finance'),
  ]);
  if (prodJson.status !== 'success') throw new Error(prodJson.message || 'gagal muat produk');
  if (accJson.status !== 'success') throw new Error(accJson.message || 'gagal muat akun');
  if (ordJson.status !== 'success') throw new Error(ordJson.message || 'gagal muat pesanan');
  if (finJson.status !== 'success') throw new Error(finJson.message || 'gagal muat keuangan');
  GridApp.state.products = prodJson.data || [];
  GridApp.state.accounts = accJson.data || [];
  GridApp.state.orders = ordJson.data || [];
  GridApp.state.finance = finJson.data || [];
  GridApp.buildLastAkun();
};

/* Akun terakhir tiap pesanan dari ledger (sumber Pesanan, urut waktu).
   orders tak simpan akun → ini satu-satunya sumber default dropdown yang benar. */
GridApp.buildLastAkun = function () {
  const map = {};
  const txs = (GridApp.state.finance || []).filter((t) => t.sumber === 'Pesanan' && t.id_pesanan);
  txs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  txs.forEach((t) => { map[t.id_pesanan] = t.akun || 'Kas'; });
  GridApp.state.lastAkunByOrder = map;
};

GridApp.lastAkun = function (orderId) {
  return GridApp.state.lastAkunByOrder[orderId] || 'Kas';
};

GridApp.accountOptions = function (selected) {
  const list = GridApp.state.accounts || [];
  const opt = (v) => `<option value="${window.escapeHtml(v)}"${v === selected ? ' selected' : ''}>${window.escapeHtml(v)}</option>`;
  if (!list.length) return opt('Kas');
  return list.map((a) => opt(a.nama)).join('');
};

GridApp.statusOptions = function (selected) {
  return GridApp.STATUS_LIST.map((s) => `<option value="${s}"${s === selected ? ' selected' : ''}>${s}</option>`).join('');
};

/* Parse string opsi "Size: M, Cuttingan: Reguler, Lengan: ..., Warna: ..."
   Format lama tanpa cuttingan tetap kebaca (cuttingan = ''). */
GridApp.parseOpsi = function (opsiStr) {
  const out = { size: '', cuttingan: '', lengan: '', warna: '', raw: String(opsiStr || '') };
  const pick = (re) => { const m = out.raw.match(re); return m ? m[1].trim() : ''; };
  out.size = pick(/size\s*:\s*([^,]+)/i);
  out.cuttingan = pick(/cuttingan\s*:\s*([^,]+)/i);
  out.lengan = pick(/lengan\s*:\s*([^,]+)/i);
  out.warna = pick(/warna\s*:\s*([^,]+)/i);
  return out;
};

/* Format kanonis buat fase 3 (saat bikin order baru dari grid).
   DB belum punya kolom cuttingan (P1 pending) → titip di `opsi`. */
GridApp.formatOpsi = function ({ size, cuttingan, lengan, warna }) {
  const parts = [];
  if (size) parts.push(`Size: ${size}`);
  if (cuttingan) parts.push(`Cuttingan: ${cuttingan}`);
  if (lengan) parts.push(`Lengan: ${lengan}`);
  if (warna) parts.push(`Warna: ${warna}`);
  return parts.join(', ');
};

GridApp.orderDate = function (o) {
  const raw = o.created_at || o.timestamp || '';
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
};
