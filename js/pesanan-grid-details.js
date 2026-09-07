/* ═══════════════════════════════════════════════════════
   PESANAN GRID — details layer (fase 3: edit atribut + qty)
   Select atribut langsung save; qty debounce. Harga satuan dihitung ulang
   client (aturan surcharge CONFIG), backend verifikasi total = hs x qty.
   Error → renderAll (kembalikan nilai server, fokus boleh hilang).
   ═══════════════════════════════════════════════════════ */
window.GridApp = window.GridApp || {};

const DETAILS_SAVE_DELAY = 600;
const detailsTimers = {};

GridApp.putDetails = async function (id, payload) {
  const res = await apiFetch(`${CONFIG.apiUrl}/api/orders/${id}?action=details`, {
    method: 'PUT', headers: GridApp.authHeaders(true), body: JSON.stringify(payload),
  });
  return res.json();
};

function detailsScopeVals(scope, id) {
  const q = (s) => scope.querySelector(`${s}[data-id="${id}"]`);
  const v = (el) => (el ? el.value : '');
  return {
    size: v(q('.attr-size')), cuttingan: v(q('.attr-cuttingan')),
    sleeve: v(q('.attr-sleeve')), warna: v(q('.attr-warna')),
    qty: Math.max(1, parseInt(v(q('.attr-qty')) || '1', 10) || 1),
  };
}

async function detailsSave(id, scope) {
  const o = GridApp.state.orders.find((x) => String(x.id) === String(id));
  if (!o || !scope) return;
  const cur = GridApp.parseOpsi(o.opsi);
  const vals = detailsScopeVals(scope, id);
  const size = vals.size || cur.size;
  const sleeve = vals.sleeve || cur.lengan;
  const warna = vals.warna || o.warna || cur.warna;
  const cuttingan = vals.cuttingan || cur.cuttingan;
  const unit = GridApp.recalcUnit(o, size, sleeve);
  const total = unit * vals.qty;
  const dibayar = Number(o.nominal_dibayar || 0);
  if (dibayar > total) {
    window.showStatus('DP sudah melebihi total baru. Koreksi pembayaran via Keuangan dulu.', false);
    GridApp.renderAll();
    return;
  }
  const payload = {
    size, warna, lengan: sleeve, cuttingan,
    opsi: GridApp.formatOpsi({ size, cuttingan, lengan: sleeve, warna }),
    qty: vals.qty, harga_satuan: unit, total,
  };
  scope.querySelectorAll(`[data-id="${id}"]`).forEach((el) => {
    if (el.classList.contains('attr-size') || el.classList.contains('attr-cuttingan')
      || el.classList.contains('attr-sleeve') || el.classList.contains('attr-warna')
      || el.classList.contains('attr-qty')) el.classList.add('cell-saving');
  });
  try {
    const json = await GridApp.putDetails(id, payload);
    if (json.status !== 'success') throw new Error(json.message || 'gagal');
    Object.assign(o, json.data);
    const totalCell = scope.querySelector('.total-cell');
    if (totalCell) totalCell.textContent = fmt(Number(o.total || 0));
    GridApp.patchPaymentUI(o);
    scope.querySelectorAll('.cell-saving').forEach((el) => {
      el.classList.remove('cell-saving'); el.classList.add('cell-saved');
      setTimeout(() => el.classList.remove('cell-saved'), 1200);
    });
  } catch (err) {
    GridApp.renderAll();
    window.showStatus('Gagal simpan detail: ' + (err.message || err), false);
  }
}

function detailsSchedule(id, scope) {
  const key = `det:${id}`;
  clearTimeout(detailsTimers[key]);
  detailsTimers[key] = setTimeout(() => detailsSave(id, scope), DETAILS_SAVE_DELAY);
}

['gridBody', 'gridCards'].forEach((wrapId) => {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  wrap.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset || !t.dataset.id || !t.closest) return;
    const isAttr = t.classList.contains('attr-size') || t.classList.contains('attr-cuttingan')
      || t.classList.contains('attr-sleeve') || t.classList.contains('attr-warna');
    if (isAttr) detailsSave(t.dataset.id, t.closest('tr, .order-row'));
    else if (t.classList.contains('attr-qty')) detailsSchedule(t.dataset.id, t.closest('tr, .order-row'));
  });
});
