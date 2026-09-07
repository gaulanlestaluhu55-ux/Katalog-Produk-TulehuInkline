/* ═══════════════════════════════════════════════════════
   PESANAN GRID — new-order layer (fase 3: tombol + Baris, desktop)
   Baris draft di tabel: pilih produk → opsi → qty/customer/akun → Simpan
   (POST /api/orders, DP 0). Mobile tetap via pesanan.html (tombol hidden).
   ═══════════════════════════════════════════════════════ */
window.GridApp = window.GridApp || {};

function newRowProduct() {
  const sel = document.querySelector('#gridNewRow .new-produk');
  if (!sel || sel.value === '') return null;
  return GridApp.state.products[parseInt(sel.value, 10)] || null;
}

function newRowUnit(p, draft) {
  if (!p) return 0;
  if (isKaos(p)) {
    return toNum(p.harga) + GridApp.surcharge(draft.size, draft.sleeve);
  }
  if (isJersey(p)) return toNum(p.harga) + getNameSetPrice(p, draft.nameset);
  return toNum(p.harga);
}

function newRowDraftVals() {
  const q = (s) => { const el = document.querySelector(`#gridNewRow ${s}`); return el ? el.value : ''; };
  return {
    size: q('.new-size'), cuttingan: q('.new-cuttingan'), sleeve: q('.new-sleeve'),
    warna: q('.new-warna'), nameset: q('.new-nameset'),
    qty: Math.max(1, parseInt(q('.new-qty') || '1', 10) || 1),
    dp: Math.max(0, parseInt(q('.new-dp') || '0', 10) || 0),
    customer: q('.new-customer').trim(), akun: q('.new-akun'),
  };
}

/* Sesuaikan sel atribut draft dengan jenis produk (kaos/jersey/lainnya). */
function newRowSyncAttrs() {
  const p = newRowProduct();
  const row = document.getElementById('gridNewRow');
  if (!row) return;
  const cells = row.querySelectorAll('.new-attr-kaos');
  if (!p || isKaos(p)) {
    if (cells[0].dataset.orig && !cells[0].querySelector('.new-size')) {
      cells.forEach((c) => { c.innerHTML = c.dataset.orig; });
    }
    return;
  }
  cells.forEach((c) => { if (!c.dataset.orig) c.dataset.orig = c.innerHTML; });
  if (isJersey(p)) {
    cells[0].innerHTML = `<select class="status-select new-nameset" aria-label="Name set">${GridApp.optionsFrom(CONFIG.jersey.nameSets, '')}</select>`;
    cells[1].textContent = '–'; cells[2].textContent = '–'; cells[3].textContent = '–';
  } else {
    cells.forEach((c) => { c.textContent = '–'; });
  }
}

function newRowPreview() {
  newRowSyncAttrs();
  const p = newRowProduct();
  const row = document.getElementById('gridNewRow');
  if (!p || !row) return;
  const v = newRowDraftVals();
  const total = newRowUnit(p, v) * v.qty;
  const t = row.querySelector('.new-total'); if (t) t.textContent = fmt(total);
  const s = row.querySelector('.new-sisa'); if (s) s.textContent = fmt(Math.max(0, total - v.dp));
}

function newRowHtml() {
  const prods = GridApp.state.products || [];
  const prodOpts = '<option value="">— Pilih —</option>' + prods.map((p, i) =>
    `<option value="${i}">${window.escapeHtml(p.nama)} (${window.escapeHtml(p.kategori || '-')})</option>`).join('');
  return `<tr id="gridNewRow">`
    + `<td><select class="status-select new-produk" aria-label="Produk">${prodOpts}</select></td>`
    + `<td class="new-attr-kaos"><select class="status-select new-size" aria-label="Size">${GridApp.optionsFrom(CONFIG.kaos.sizes, '')}</select></td>`
    + `<td class="new-attr-kaos"><select class="status-select new-cuttingan" aria-label="Cuttingan">${GridApp.optionsFrom(GridApp.CUTTINGAN_LIST, 'Reguler')}</select></td>`
    + `<td class="new-attr-kaos"><select class="status-select new-sleeve" aria-label="Lengan">${GridApp.optionsFrom(CONFIG.kaos.sleeves, '')}</select></td>`
    + `<td class="new-attr-kaos"><select class="status-select new-warna" aria-label="Warna">${GridApp.optionsFrom(CONFIG.kaos.colors, '')}</select></td>`
    + `<td class="num"><input class="cell-num new-qty" type="number" min="1" step="1" value="1" aria-label="Qty" /></td>`
    + `<td class="num new-total">${fmt(0)}</td>`
    + `<td class="num"><input class="cell-num new-dp" type="number" min="0" step="500" value="0" aria-label="DP awal" /></td>`
    + `<td><select class="status-select new-akun" aria-label="Akun">${GridApp.accountOptions('Kas')}</select></td>`
    + `<td class="num new-sisa">${fmt(0)}</td>`
    + `<td>–</td>`
    + `<td><input class="cell-num new-customer" type="text" style="width:130px;text-align:left" placeholder="Nama customer" aria-label="Nama customer" /></td>`
    + `<td style="white-space:nowrap"><button class="icon-btn primary" id="newRowSave">Simpan</button> <button class="icon-btn danger" id="newRowCancel">Batal</button></td>`
    + `</tr>`;
}

async function newRowSave() {
  const p = newRowProduct();
  const v = newRowDraftVals();
  if (!p) { window.showStatus('Pilih produk dulu.', false); return; }
  if (!v.customer) { window.showStatus('Isi nama customer.', false); return; }
  if (!v.akun) { window.showStatus('Pilih akun pembayaran.', false); return; }
  let size = '', sleeve = '', warna = '', opsi = '';
  if (isKaos(p)) {
    if (!v.size || !v.sleeve || !v.warna) { window.showStatus('Lengkapi opsi kaos (ukuran/lengan/warna).', false); return; }
    size = v.size; sleeve = v.sleeve; warna = v.warna;
    opsi = GridApp.formatOpsi({ size, cuttingan: v.cuttingan, lengan: sleeve, warna });
  } else if (isJersey(p)) {
    if (!v.nameset) { window.showStatus('Pilih name set jersey.', false); return; }
    opsi = `Name set: ${v.nameset}`;
  }
  const unit = newRowUnit(p, v);
  const total = unit * v.qty;
  if (v.dp > total) { window.showStatus('DP tidak boleh lebih besar dari total.', false); return; }
  const btn = document.getElementById('newRowSave');
  btn.disabled = true;
  try {
    const res = await apiFetch(`${CONFIG.apiUrl}/api/orders`, {
      method: 'POST', headers: GridApp.authHeaders(true),
      body: JSON.stringify({
        id_produk: p.id || '', nama_produk: p.nama, kategori: p.kategori || '',
        opsi, size, warna, lengan: sleeve, qty: v.qty,
        harga_satuan: unit, total, nama_customer: v.customer,
        kontak: '', catatan: '', status: 'Baru', nominal_dibayar: v.dp, akun: v.akun,
      }),
    });
    const json = await res.json();
    if (json.status !== 'success') throw new Error(json.message || 'gagal');
    document.getElementById('gridNewRow').remove();
    await GridApp.refreshOrders();
    window.showStatus('Pesanan tersimpan.', true);
  } catch (err) {
    btn.disabled = false;
    window.showStatus('Gagal simpan: ' + (err.message || err), false);
  }
}

document.getElementById('addRowBtn').addEventListener('click', () => {
  const body = document.getElementById('gridBody');
  if (document.getElementById('gridNewRow')) {
    document.querySelector('#gridNewRow .new-produk').focus();
    return;
  }
  body.insertAdjacentHTML('afterbegin', newRowHtml());
  document.getElementById('gridNewRow').addEventListener('change', newRowPreview);
  document.getElementById('gridNewRow').addEventListener('input', newRowPreview);
  document.getElementById('newRowSave').addEventListener('click', newRowSave);
  document.getElementById('newRowCancel').addEventListener('click', () => {
    document.getElementById('gridNewRow').remove();
  });
  document.querySelector('#gridNewRow .new-produk').focus();
});
