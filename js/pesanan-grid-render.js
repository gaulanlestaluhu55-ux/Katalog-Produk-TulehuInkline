/* ═══════════════════════════════════════════════════════
   PESANAN GRID — render layer (fase 2: sel editable)
   Tanggung jawab: gambar tabel desktop + kartu mobile + filter.
   PUT/POST + debounce ada di pesanan-grid-edit.js.
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

/* Satu baris <tr> desktop. Dibayar/Akun/Status editable (fase 2). */
function gridRowHtml(o) {
  const p = GridApp.parseOpsi(o.opsi);
  const id = window.escapeHtml(o.id);
  const total = Number(o.total || 0);
  const dibayar = Number(o.nominal_dibayar || 0);
  const sisa = o.sisa !== undefined && o.sisa !== '' && o.sisa !== null
    ? Number(o.sisa) : total - dibayar;
  const statusBayar = o.status_bayar || 'Belum Bayar';
  const locked = o.status === 'Batal' ? 'disabled' : '';
  const cust = window.escapeHtml(o.nama_customer || '-');
  const kontak = o.kontak ? `<span class="sub">${window.escapeHtml(o.kontak)}</span>` : '';
  const ts = GridApp.orderDate(o);
  const dateSub = ts ? `<span class="sub">${window.escapeHtml(ts)}</span>` : '';

  return `<tr data-id="${id}">`
    + `<td>${gridCell(o.nama_produk)}${dateSub}</td>`
    + `<td>${gridCell(p.size)}</td>`
    + `<td>${gridCell(p.cuttingan)}</td>`
    + `<td>${gridCell(p.lengan)}</td>`
    + `<td>${gridCell(o.warna || p.warna)}</td>`
    + `<td class="num">${window.escapeHtml(o.qty ?? 0)}</td>`
    + `<td class="num">${gridMoney(total)}</td>`
    + `<td class="num"><input class="cell-num pay-input" data-id="${id}" type="number" min="0" step="500" value="${dibayar}" ${locked} aria-label="Nominal dibayar" /></td>`
    + `<td><select class="status-select pay-akun" data-id="${id}" ${locked} aria-label="Akun pembayaran">${GridApp.accountOptions(GridApp.lastAkun(o.id))}</select></td>`
    + `<td class="num sisa-cell">${gridMoney(Math.max(0, sisa))}</td>`
    + `<td class="bayar-cell"><span class="status-badge ${window.safeClassToken(statusBayar, 'belum-bayar')}">${window.escapeHtml(statusBayar)}</span></td>`
    + `<td>${cust}${kontak}</td>`
    + `<td><select class="status-select status-cell" data-id="${id}" aria-label="Status pesanan">${GridApp.statusOptions(o.status || 'Baru')}</select></td>`
    + `</tr>`;
}

/* Satu kartu mobile (reuse pola .order-row pesanan.html + editor fase 2). */
function gridCardHtml(o) {
  const p = GridApp.parseOpsi(o.opsi);
  const id = window.escapeHtml(o.id);
  const total = Number(o.total || 0);
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
    + `</div><div class="order-total">${gridMoney(total)}</div></div>`
    + `<div class="order-badges">`
    + `<span class="status-badge bayar-badge ${window.safeClassToken(statusBayar, 'belum-bayar')}">${window.escapeHtml(statusBayar)}</span>`
    + `</div>`
    + `<div class="order-edit">`
    + `<label>Bayar<input class="cell-num pay-input" data-id="${id}" type="number" min="0" step="500" value="${dibayar}" ${locked} /></label>`
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
    body.innerHTML = '<tr><td colspan="13">Belum ada pesanan.</td></tr>';
    cards.innerHTML = '<div class="empty-state">Belum ada pesanan.</div>';
    return;
  }
  body.innerHTML = rows.map(gridRowHtml).join('');
  cards.innerHTML = rows.map(gridCardHtml).join('');
};

/* Entry point dipanggil via requireAuth di pesanan-grid.html. */
GridApp.boot = async function () {
  try {
    await GridApp.fetchAll();
    GridApp.renderAll();
  } catch (err) {
    document.getElementById('gridBody').innerHTML =
      `<tr><td colspan="13">Gagal memuat: ${window.escapeHtml(err.message || err)}</td></tr>`;
    document.getElementById('gridCards').innerHTML =
      `<div class="empty-state">Gagal memuat: ${window.escapeHtml(err.message || err)}</div>`;
    window.showStatus('Gagal konek ke server: ' + (err.message || err), false);
  }
};

document.getElementById('filterBtns').addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  GridApp.state.filter = btn.dataset.status;
  GridApp.renderAll();
});
