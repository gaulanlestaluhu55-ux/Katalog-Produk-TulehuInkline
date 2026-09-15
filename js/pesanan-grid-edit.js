/* ═══════════════════════════════════════════════════════
   PESANAN GRID — edit layer (F2: tambah-bayar append-only)
   - Kolom Dibayar read-only (angka dari server). Tambah dicatat per
     cicilan via input Tambah + Akun (disimpan saat change).
   - Akun WAJIB tiap tambah; overpay (tambah > sisa) ditolak lokal,
     server validasi ulang. Batal tetap dikunci.
   ═══════════════════════════════════════════════════════ */
window.GridApp = window.GridApp || {};

GridApp.putPayment = async function (id, payload) {
  const res = await apiFetch(`${CONFIG.apiUrl}/api/orders/${id}?action=payment`, {
    method: 'PUT', headers: GridApp.authHeaders(true), body: JSON.stringify(payload),
  });
  return res.json();
};

GridApp.putStatus = async function (id, payload) {
  const res = await apiFetch(`${CONFIG.apiUrl}/api/orders/${id}`, {
    method: 'PUT', headers: GridApp.authHeaders(true), body: JSON.stringify(payload),
  });
  return res.json();
};

function gridScope(el) {
  return el.closest('tr, .order-row');
}

function gridMark(el, cls) {
  if (!el) return;
  el.classList.remove('cell-saving', 'cell-saved', 'cell-error');
  if (cls) el.classList.add(cls);
  if (cls === 'cell-saved') setTimeout(() => el.classList.remove('cell-saved'), 1200);
}

function gridFindOrder(id) {
  return GridApp.state.orders.find((x) => String(x.id) === String(id));
}

/* Simpan 1 cicilan baru (F2). Input kosong/nol = tidak ada yang disimpan. */
async function gridSaveTambah(id, scope) {
  const o = gridFindOrder(id);
  const tambahEl = scope ? scope.querySelector(`.tambah-input[data-id="${id}"]`) : null;
  const akun = scope ? scope.querySelector(`.pay-akun[data-id="${id}"]`) : null;
  if (!o || !tambahEl) return;
  const tambah = Math.max(0, parseInt(tambahEl.value || '0', 10) || 0);
  if (tambah <= 0) { gridMark(tambahEl, ''); return; }
  const akunVal = akun ? akun.value : '';
  if (!akunVal) {
    gridMark(akun || tambahEl, 'cell-error');
    window.showStatus('Pilih akun pembayaran dulu.', false);
    return;
  }
  const total = Number(o.total || 0);
  const sisa = total - Number(o.nominal_dibayar || 0);
  if (tambah > sisa) {
    gridMark(tambahEl, 'cell-error');
    window.showStatus(`Melebihi sisa (${fmt(Math.max(0, sisa))}). Maksimal sebesar sisa.`, false);
    return;
  }
  gridMark(tambahEl, 'cell-saving'); gridMark(akun, 'cell-saving');
  try {
    const json = await GridApp.putPayment(id, { tambah, akun: akunVal });
    if (json.status !== 'success') throw new Error(json.message || 'gagal');
    o.nominal_dibayar = json.data.nominal_dibayar;
    o.sisa = json.data.sisa;
    o.status_bayar = json.data.status_bayar;
    GridApp.state.lastAkunByOrder[id] = akunVal;
    GridApp.patchPaymentUI(o);
    window.showStatus(`Tercatat +${fmt(tambah)} via ${akunVal}.`, true);
  } catch (err) {
    tambahEl.value = '';
    if (akun) akun.value = GridApp.lastAkun(id);
    gridMark(tambahEl, 'cell-error');
    window.showStatus('Gagal simpan pembayaran: ' + (err.message || err), false);
  }
}

async function gridSaveStatus(sel, id) {
  const o = gridFindOrder(id);
  if (!o) return;
  const next = sel.value;
  if (next === o.status) return;
  if (next === 'Batal' && !confirm('Batalkan pesanan? Pembayaran yang sudah masuk otomatis di-reversal di Keuangan.')) {
    sel.value = o.status;
    return;
  }
  gridMark(sel, 'cell-saving');
  try {
    const json = await GridApp.putStatus(id, { status: next });
    if (json.status !== 'success') throw new Error(json.message || 'gagal');
    o.status = next;
    if (next === 'Batal') {
      o.nominal_dibayar = 0; o.sisa = o.total; o.status_bayar = 'Belum Bayar';
      GridApp.renderAll();
      window.showStatus('Pesanan dibatalkan, pembayaran otomatis di-reversal di Keuangan.', true);
    } else {
      gridMark(sel, 'cell-saved');
      window.showStatus('Status pesanan diupdate.', true);
    }
  } catch (err) {
    sel.value = o.status;
    gridMark(sel, 'cell-error');
    window.showStatus('Gagal simpan status: ' + (err.message || err), false);
  }
}

/* Patch ringan tanpa renderAll (biar fokus input tak hilang). */
GridApp.patchPaymentUI = function (o) {
  const total = Number(o.total || 0);
  const dibayar = Number(o.nominal_dibayar || 0);
  const sisa = Math.max(0, Number(o.sisa ?? total - dibayar));
  const badge = `<span class="status-badge bayar-badge ${window.safeClassToken(o.status_bayar, 'belum-bayar')}">${window.escapeHtml(o.status_bayar)}</span>`;
  document.querySelectorAll(`tr[data-id="${o.id}"]`).forEach((tr) => {
    const p = tr.querySelector('.paid-cell'); if (p) p.textContent = fmt(dibayar);
    const t = tr.querySelector('.tambah-input'); if (t) { t.value = ''; gridMark(t, 'cell-saved'); }
    const ak = tr.querySelector('.pay-akun'); if (ak) ak.value = GridApp.lastAkun(o.id);
    const s = tr.querySelector('.sisa-cell'); if (s) s.textContent = fmt(sisa);
    const b = tr.querySelector('.bayar-cell'); if (b) b.innerHTML = badge + ` <button class="link-btn hist-btn" data-id="${o.id}">Riwayat</button>`;
  });
  document.querySelectorAll(`.order-row[data-id="${o.id}"]`).forEach((card) => {
    const t = card.querySelector('.tambah-input'); if (t) { t.value = ''; gridMark(t, 'cell-saved'); }
    const ak = card.querySelector('.pay-akun'); if (ak) ak.value = GridApp.lastAkun(o.id);
    const p = card.querySelector('.paid-val'); if (p) p.textContent = fmt(dibayar);
    const s = card.querySelector('.sisa-val'); if (s) s.textContent = fmt(sisa);
    const b = card.querySelector('.bayar-badge'); if (b) b.outerHTML = badge;
  });
};

['gridBody', 'gridCards'].forEach((wrapId) => {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  wrap.addEventListener('input', (e) => {
    if (e.target.classList && e.target.classList.contains('tambah-input')) gridMark(e.target, '');
  });
  wrap.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.id) return;
    if (t.classList.contains('tambah-input')) {
      gridSaveTambah(t.dataset.id, gridScope(t));
    } else if (t.classList.contains('pay-akun')) {
      GridApp.state.lastAkunByOrder[t.dataset.id] = t.value;
      gridMark(t, 'cell-saved');
    } else if (t.classList.contains('status-cell')) {
      gridSaveStatus(t, t.dataset.id);
    }
  });
});
