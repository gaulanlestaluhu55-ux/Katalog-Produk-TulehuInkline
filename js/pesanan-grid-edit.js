/* ═══════════════════════════════════════════════════════
   PESANAN GRID — edit layer (fase 2: edit per sel + auto-save)
   - Input Dibayar + select Akun/Status auto-save (debounce 600ms).
   - Akun WAJIB: request tanpa akun diblok, tak ada default diam-diam.
   - Ganti akun SAJA (nominal sama) tak panggil API: backend hanya catat
     ledger saat delta != 0. Koreksi akun lama via halaman Keuangan.
   ═══════════════════════════════════════════════════════ */
window.GridApp = window.GridApp || {};

const GRID_SAVE_DELAY = 600;
const gridTimers = {};

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

async function gridSavePayment(id, scope) {
  const o = gridFindOrder(id);
  const pay = scope ? scope.querySelector(`.pay-input[data-id="${id}"]`) : null;
  const akun = scope ? scope.querySelector(`.pay-akun[data-id="${id}"]`) : null;
  if (!o || !pay) return;
  const total = Number(o.total || 0);
  const nominal = Math.max(0, parseInt(pay.value || '0', 10) || 0);
  const akunVal = akun ? akun.value : '';
  if (!akunVal) {
    gridMark(akun || pay, 'cell-error');
    window.showStatus('Pilih akun pembayaran dulu.', false);
    return;
  }
  if (nominal === Number(o.nominal_dibayar || 0)) {
    gridMark(pay, ''); gridMark(akun, '');
    window.showStatus('Akun dipakai untuk pencatatan berikutnya. Koreksi akun lama via Keuangan.', true);
    return;
  }
  if (nominal > total && !confirm(`Nominal (${fmt(nominal)}) melebihi total (${fmt(total)}). Simpan?`)) {
    pay.value = o.nominal_dibayar; gridMark(pay, '');
    return;
  }
  gridMark(pay, 'cell-saving'); gridMark(akun, 'cell-saving');
  try {
    const json = await GridApp.putPayment(id, { nominal_dibayar: nominal, akun: akunVal });
    if (json.status !== 'success') throw new Error(json.message || 'gagal');
    o.nominal_dibayar = json.data.nominal_dibayar;
    o.sisa = json.data.sisa;
    o.status_bayar = json.data.status_bayar;
    GridApp.state.lastAkunByOrder[id] = akunVal;
    GridApp.patchPaymentUI(o);
    gridMark(pay, 'cell-saved'); gridMark(akun, 'cell-saved');
  } catch (err) {
    pay.value = o.nominal_dibayar;
    if (akun) akun.value = GridApp.lastAkun(id);
    gridMark(pay, 'cell-error');
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
    const inp = tr.querySelector('.pay-input'); if (inp) inp.value = dibayar;
    const ak = tr.querySelector('.pay-akun'); if (ak) ak.value = GridApp.lastAkun(o.id);
    const s = tr.querySelector('.sisa-cell'); if (s) s.textContent = fmt(sisa);
    const b = tr.querySelector('.bayar-cell'); if (b) b.innerHTML = badge;
  });
  document.querySelectorAll(`.order-row[data-id="${o.id}"]`).forEach((card) => {
    const inp = card.querySelector('.pay-input'); if (inp) inp.value = dibayar;
    const ak = card.querySelector('.pay-akun'); if (ak) ak.value = GridApp.lastAkun(o.id);
    const p = card.querySelector('.paid-val'); if (p) p.textContent = fmt(dibayar);
    const s = card.querySelector('.sisa-val'); if (s) s.textContent = fmt(sisa);
    const b = card.querySelector('.bayar-badge'); if (b) b.outerHTML = badge;
  });
};

function gridSchedule(id, scope) {
  const key = `pay:${id}`;
  clearTimeout(gridTimers[key]);
  gridTimers[key] = setTimeout(() => gridSavePayment(id, scope), GRID_SAVE_DELAY);
}

['gridBody', 'gridCards'].forEach((wrapId) => {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  wrap.addEventListener('input', (e) => {
    if (e.target.classList && e.target.classList.contains('pay-input')) gridMark(e.target, '');
  });
  wrap.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.id) return;
    if (t.classList.contains('pay-input') || t.classList.contains('pay-akun')) {
      gridSchedule(t.dataset.id, gridScope(t));
    } else if (t.classList.contains('status-cell')) {
      gridSaveStatus(t, t.dataset.id);
    }
  });
});
