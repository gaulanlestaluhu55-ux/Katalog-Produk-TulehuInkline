/* ═══════════════════════════════════════════════════════
   PESANAN GRID — render layer (fase 3: sel atribut editable)
   Tanggung jawab: gambar tabel desktop + kartu mobile + filter.
   PUT/POST + debounce ada di pesanan-grid-edit.js / details / new.
   ═══════════════════════════════════════════════════════ */
window.GridApp = window.GridApp || {};

GridApp.filteredOrders = function () {
  const { orders, filter } = GridApp.state;
  if (filter === 'semua') return orders;
  return orders.filter((o) => o.status === filter);
};

function gridCell(v) {
  const s = String(v ?? '').trim();
  return s ? window.escapeHtml(s) : '–';
}

function gridMoney(n) {
  return window.escapeHtml(fmt(Number(n || 0)));
}

function attrSelect(cls, id, list, val, label, locked) {
  return `<select class="status-select ${cls}" data-id="${id}" ${locked} aria-label="${label}">${GridApp.optionsFrom(list, val)}</select>`;
}

/* Satu baris <tr> desktop. Atribut kaos + qty editable (fase 3). */
function gridRowHtml(o) {
  const p = GridApp.parseOpsi(o.opsi);
  const id = window.escapeHtml(o.id);
  const total = Number(o.total || 0);
  const pricing = GridApp.discountTotals(o.harga_satuan, o.qty, o.discount_type, o.discount_value);
  const discountType = o.discount_type === 'percent' ? 'percent' : 'nominal';
  const discountValue = Number(o.discount_value || 0);
  const dibayar = Number(o.nominal_dibayar || 0);
  const sisa = o.sisa !== undefined && o.sisa !== '' && o.sisa !== null
    ? Number(o.sisa) : total - dibayar;
  const statusBayar = o.status_bayar || 'Belum Bayar';
  const locked = o.status === 'Batal' ? 'disabled' : '';
  const kaos = isKaos(o);
  const warnaVal = o.warna || p.warna;
  /* D3: opsi size/warna ikut produk (fallback global bila ''/kosong). */
  const prod = (GridApp.state.products || []).find((x) => String(x.id) === String(o.id_produk)) || null;
  const cust = window.escapeHtml(o.nama_customer || '-');
  const kontak = o.kontak ? `<span class="sub">${window.escapeHtml(o.kontak)}</span>` : '';
  const ts = GridApp.orderDate(o);
  const dateSub = ts ? `<span class="sub">${window.escapeHtml(ts)}</span>` : '';

  const sizeCell = kaos ? attrSelect('attr-size', id, productSizes(prod), p.size, 'Size', locked) : gridCell(p.size);
  const cutCell = kaos ? attrSelect('attr-cuttingan', id, GridApp.CUTTINGAN_LIST, p.cuttingan, 'Cuttingan', locked) : gridCell(p.cuttingan);
  const sleeveCell = kaos ? attrSelect('attr-sleeve', id, CONFIG.kaos.sleeves, p.lengan, 'Lengan', locked) : gridCell(p.lengan);
  const warnaCell = kaos ? attrSelect('attr-warna', id, productColors(prod), warnaVal, 'Warna', locked) : gridCell(warnaVal);

  return `<tr data-id="${id}">`
    + `<td>${gridCell(o.nama_produk)}${dateSub}</td>`
    + `<td>${sizeCell}</td>`
    + `<td>${cutCell}</td>`
    + `<td>${sleeveCell}</td>`
    + `<td>${warnaCell}</td>`
    + `<td class="num"><input class="cell-num attr-qty" data-id="${id}" type="number" min="1" step="1" value="${o.qty || 1}" ${locked} aria-label="Qty" /></td>`
    + `<td><select class="status-select discount-type" data-id="${id}" ${locked} aria-label="Tipe diskon"><option value="nominal"${discountType === 'nominal' ? ' selected' : ''}>Rp</option><option value="percent"${discountType === 'percent' ? ' selected' : ''}>%</option></select><input class="cell-num discount-value" data-id="${id}" type="number" min="0" step="${discountType === 'percent' ? '0.01' : '500'}" value="${discountValue}" ${locked} aria-label="Nilai diskon" /></td>`
    + `<td class="num"><span class="sub">Subtotal ${gridMoney(pricing.subtotal)}</span><b class="total-cell">${gridMoney(total)}</b><span class="sub">Potongan ${gridMoney(pricing.discount)}</span></td>`
    + `<td class="num paid-cell">${gridMoney(dibayar)}</td>`
    + `<td><select class="status-select pay-akun" data-id="${id}" ${locked} aria-label="Akun untuk tambah bayar">${GridApp.accountOptions(GridApp.lastAkun(o.id))}</select></td>`
    + `<td class="num"><input class="cell-num tambah-input" data-id="${id}" type="number" min="0" step="500" value="" placeholder="0" ${locked} aria-label="Tambah bayar" /></td>`
    + `<td class="num sisa-cell">${gridMoney(Math.max(0, sisa))}</td>`
    + `<td class="bayar-cell"><span class="status-badge ${window.safeClassToken(statusBayar, 'belum-bayar')}">${window.escapeHtml(statusBayar)}</span> <button class="link-btn hist-btn" data-id="${id}">Riwayat</button></td>`
    + `<td>${cust}${kontak}</td>`
    + `<td><select class="status-select status-cell" data-id="${id}" aria-label="Status pesanan">${GridApp.statusOptions(o.status || 'Baru')}</select></td>`
    + `</tr>`;
}

/* Satu kartu mobile (editor: bayar/akun/status + qty; atribut lain teks). */
function gridCardHtml(o) {
  const p = GridApp.parseOpsi(o.opsi);
  const id = window.escapeHtml(o.id);
  const total = Number(o.total || 0);
  const pricing = GridApp.discountTotals(o.harga_satuan, o.qty, o.discount_type, o.discount_value);
  const discountType = o.discount_type === 'percent' ? 'percent' : 'nominal';
  const discountValue = Number(o.discount_value || 0);
  const dibayar = Number(o.nominal_dibayar || 0);
  const sisa = o.sisa !== undefined && o.sisa !== '' && o.sisa !== null
    ? Number(o.sisa) : total - dibayar;
  const statusBayar = o.status_bayar || 'Belum Bayar';
  const locked = o.status === 'Batal' ? 'disabled' : '';
  const meta = [p.size, p.cuttingan, p.lengan, o.warna || p.warna, `Qty ${o.qty || 0}`]
    .filter(Boolean).map(window.escapeHtml).join(' · ');
  const ts = GridApp.orderDate(o);

  return `<div class="order-row" data-id="${id}">`
    + `<div class="order-top"><div>`
    + `<div class="order-name">${gridCell(o.nama_produk)}</div>`
    + `<div class="order-meta">${meta}${ts ? ' · ' + window.escapeHtml(ts) : ''}</div>`
    + `</div><div class="order-total"><span class="sub">Subtotal ${gridMoney(pricing.subtotal)}</span>${gridMoney(total)}<span class="sub">Potongan ${gridMoney(pricing.discount)}</span></div></div>`
    + `<div class="order-badges">`
    + `<span class="status-badge bayar-badge ${window.safeClassToken(statusBayar, 'belum-bayar')}">${window.escapeHtml(statusBayar)}</span>`
    + `<button class="link-btn hist-btn" data-id="${id}">Riwayat</button>`
    + `</div>`
    + `<div class="order-edit">`
    + `<label>Qty<input class="cell-num attr-qty" data-id="${id}" type="number" min="1" step="1" value="${o.qty || 1}" ${locked} /></label>`
    + `<label>Diskon<select class="status-select discount-type" data-id="${id}" ${locked}><option value="nominal"${discountType === 'nominal' ? ' selected' : ''}>Rupiah</option><option value="percent"${discountType === 'percent' ? ' selected' : ''}>Persen</option></select><input class="cell-num discount-value" data-id="${id}" type="number" min="0" step="${discountType === 'percent' ? '0.01' : '500'}" value="${discountValue}" ${locked} /></label>`
    + `<label>Tambah<input class="cell-num tambah-input" data-id="${id}" type="number" min="0" step="500" value="" placeholder="0" ${locked} /></label>`
    + `<label>Akun<select class="status-select pay-akun" data-id="${id}" ${locked}>${GridApp.accountOptions(GridApp.lastAkun(o.id))}</select></label>`
    + `<label>Status<select class="status-select status-cell" data-id="${id}">${GridApp.statusOptions(o.status || 'Baru')}</select></label>`
    + `</div>`
    + `<div class="order-pay">Dibayar: <b class="paid-val">${gridMoney(dibayar)}</b> · Sisa: <b class="sisa-val">${gridMoney(Math.max(0, sisa))}</b></div>`
    + (o.nama_customer ? `<div class="order-meta">👤 ${window.escapeHtml(o.nama_customer)}</div>` : '')
    + `</div>`;
}

GridApp.renderAll = function () {
  const rows = GridApp.filteredOrders();
  const body = document.getElementById('gridBody');
  const cards = document.getElementById('gridCards');
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="15">Belum ada pesanan.</td></tr>';
    cards.innerHTML = '<div class="empty-state">Belum ada pesanan.</div>';
    GridApp.syncTopScroll();
    return;
  }
  body.innerHTML = rows.map(gridRowHtml).join('');
  cards.innerHTML = rows.map(gridCardHtml).join('');
  GridApp.syncTopScroll();
};

/* Scrollbar horizontal ATAS, sinkron dua arah dengan .table-wrap.
   Supaya geser kanan-kiri bisa dari atas tanpa scroll halaman ke bawah dulu.
   Auto-sembunyi kalau tabel muat penuh (tidak overflow). */
GridApp.syncTopScroll = function () {
  const top = document.getElementById('gridTopScroll');
  const wrap = document.querySelector('#gridTableCard .table-wrap');
  const table = document.getElementById('gridTable');
  const spacer = document.getElementById('gridTopSpacer');
  if (!top || !wrap || !table || !spacer) return;
  spacer.style.width = table.scrollWidth + 'px';
  top.style.visibility = table.scrollWidth > wrap.clientWidth + 1 ? 'visible' : 'hidden';
};

(function initTopScroll() {
  const top = document.getElementById('gridTopScroll');
  const wrap = document.querySelector('#gridTableCard .table-wrap');
  if (!top || !wrap) return;
  let lock = false;
  top.addEventListener('scroll', () => {
    if (lock) return;
    lock = true;
    wrap.scrollLeft = top.scrollLeft;
    lock = false;
  });
  wrap.addEventListener('scroll', () => {
    if (lock) return;
    lock = true;
    top.scrollLeft = wrap.scrollLeft;
    lock = false;
  });
  window.addEventListener('resize', () => GridApp.syncTopScroll());
})();

/* Entry point dipanggil via requireAuth di pesanan-grid.html. */
GridApp.boot = async function () {
  try {
    await GridApp.fetchAll();
    GridApp.renderAll();
  } catch (err) {
    document.getElementById('gridBody').innerHTML =
      `<tr><td colspan="15">Gagal memuat: ${window.escapeHtml(err.message || err)}</td></tr>`;
    document.getElementById('gridCards').innerHTML =
      `<div class="empty-state">Gagal memuat: ${window.escapeHtml(err.message || err)}</div>`;
    window.showStatus('Gagal konek ke server: ' + (err.message || err), false);
  }
};

GridApp.refreshOrders = async function () {
  const json = await (async () => {
    const res = await apiFetch(`${CONFIG.apiUrl}/api/orders`, { headers: GridApp.authHeaders() });
    return res.json();
  })();
  if (json.status !== 'success') throw new Error(json.message || 'gagal');
  GridApp.state.orders = json.data || [];
  GridApp.renderAll();
};

document.getElementById('filterBtns').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  GridApp.state.filter = btn.dataset.status;
  GridApp.renderAll();
});
