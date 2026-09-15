/* ═══════════════════════════════════════════════════════
   PESANAN GRID — history layer (F2: riwayat cicilan per order)
   Modal read-only via GET /api/orders/:id?action=payments.
   Koreksi per baris (F3): void full ke akun asal via
   PUT /api/orders/:id?action=void-payment. Koreksi sebagian = void
   lalu tambah baru yang benar.
   ═══════════════════════════════════════════════════════ */
window.GridApp = window.GridApp || {};

GridApp.fetchPayments = async function (id) {
  const res = await apiFetch(`${CONFIG.apiUrl}/api/orders/${id}?action=payments`, {
    headers: GridApp.authHeaders(),
  });
  return res.json();
};

GridApp.voidPayment = async function (orderId, paymentId) {
  const res = await apiFetch(`${CONFIG.apiUrl}/api/orders/${orderId}?action=void-payment`, {
    method: 'PUT', headers: GridApp.authHeaders(true), body: JSON.stringify({ payment_id: paymentId }),
  });
  return res.json();
};

GridApp.confirmVoid = async function (orderId, paymentId, label) {
  if (!confirm(`Koreksi (void) ${label}? Nominalnya dikembalikan dari akun asal.`)) return;
  try {
    const json = await GridApp.voidPayment(orderId, paymentId);
    if (json.status !== 'success') throw new Error(json.message || 'gagal');
    const o = (GridApp.state.orders || []).find((x) => String(x.id) === String(orderId));
    if (o) {
      o.nominal_dibayar = json.data.nominal_dibayar;
      o.sisa = json.data.sisa;
      o.status_bayar = json.data.status_bayar;
      GridApp.patchPaymentUI(o);
    }
    window.showStatus('Baris dikoreksi (void ke akun asal).', true);
    GridApp.openHistory(orderId);
  } catch (err) {
    window.showStatus('Gagal koreksi: ' + (err.message || err), false);
  }
};

function histDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

GridApp.openHistory = async function (id) {
  const o = (GridApp.state.orders || []).find((x) => String(x.id) === String(id));
  const modal = document.getElementById('payHistModal');
  const body = document.getElementById('payHistBody');
  const title = document.getElementById('payHistTitle');
  if (!modal || !body || !title) return;
  title.textContent = o ? `Riwayat bayar — ${o.nama_produk} (${o.nama_customer})` : 'Riwayat bayar';
  body.innerHTML = '<div class="empty-state">Memuat...</div>';
  modal.hidden = false;
  try {
    const json = await GridApp.fetchPayments(id);
    if (json.status !== 'success') throw new Error(json.message || 'gagal');
    const rows = json.data || [];
    if (!rows.length) {
      body.innerHTML = '<div class="empty-state">Belum ada cicilan.</div>';
      return;
    }
    body.innerHTML = rows.map((r) => {
      const neg = Number(r.nominal || 0) < 0;
      const canVoid = ['DP', 'Pelunasan', 'Cicilan'].includes(r.tipe) && Number(r.nominal || 0) > 0;
      const voidBtn = canVoid
        ? ` <button class="link-btn hist-void" data-order="${window.escapeHtml(id)}" data-pay="${window.escapeHtml(r.id)}">Koreksi</button>`
        : '';
      return `<div class="hist-row" data-pay-id="${window.escapeHtml(r.id)}">`
        + `<div><b class="${neg ? 'hist-neg' : 'hist-pos'}">${neg ? '−' : '+'}${window.escapeHtml(fmt(Math.abs(Number(r.nominal || 0))))}</b>`
        + `<span class="sub">${window.escapeHtml(r.tipe || '')} · ${window.escapeHtml(r.akun || '')}${voidBtn}</span></div>`
        + `<div class="hist-meta">${window.escapeHtml(histDate(r.created_at))}`
        + `<span class="sub">${window.escapeHtml(r.keterangan || '')}</span></div>`
        + `</div>`;
    }).join('');
  } catch (err) {
    body.innerHTML = `<div class="empty-state">Gagal memuat: ${window.escapeHtml(err.message || err)}</div>`;
  }
};

GridApp.closeHistory = function () {
  const modal = document.getElementById('payHistModal');
  if (modal) modal.hidden = true;
};

document.addEventListener('click', (e) => {
  const vbtn = e.target.closest ? e.target.closest('.hist-void') : null;
  if (vbtn && vbtn.dataset.pay) {
    const row = vbtn.closest('.hist-row');
    const amt = row ? row.querySelector('b').textContent : '';
    GridApp.confirmVoid(vbtn.dataset.order, vbtn.dataset.pay, amt);
    return;
  }
  const btn = e.target.closest ? e.target.closest('.hist-btn') : null;
  if (btn && btn.dataset.id) {
    GridApp.openHistory(btn.dataset.id);
    return;
  }
  if (e.target.id === 'payHistModal' || (e.target.closest && e.target.closest('#payHistClose'))) {
    GridApp.closeHistory();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') GridApp.closeHistory();
});
