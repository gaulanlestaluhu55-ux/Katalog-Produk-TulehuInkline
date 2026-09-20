window.BulkOrderApp = window.BulkOrderApp || {};

BulkOrderApp.state = { products: [], accounts: [], orders: [], rows: [{ warna: 'Hitam', lengan: 'Lengan Pendek' }] };
BulkOrderApp.statuses = ['Menunggu DP', 'Siap Produksi', 'Diproses', 'Selesai Produksi', 'Siap Diambil', 'Diambil', 'Batal'];

BulkOrderApp.auth = function(json) {
  const headers = { Authorization: `Bearer ${window.adminToken}` };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
};

BulkOrderApp.getJson = async function(path, options) {
  const response = await apiFetch(`${CONFIG.apiUrl}${path}`, options || { headers: BulkOrderApp.auth() });
  const json = await response.json();
  if (json.status !== 'success') throw new Error(json.message || 'Request gagal.');
  return json.data;
};

BulkOrderApp.selectedProduct = function() {
  return BulkOrderApp.state.products.find((product) => product.id === document.getElementById('bulkProduct').value) || null;
};

BulkOrderApp.pipeOptions = function(value, fallback) {
  const values = String(value || '').split('|').map((part) => part.trim()).filter(Boolean);
  return values.length ? [...new Set(values)] : fallback;
};

BulkOrderApp.sizes = function() { return BulkOrderApp.pipeOptions(BulkOrderApp.selectedProduct()?.sizes, CONFIG.kaos.sizes); };
BulkOrderApp.colors = function() { return BulkOrderApp.pipeOptions(BulkOrderApp.selectedProduct()?.colors, CONFIG.kaos.colors); };
BulkOrderApp.esc = function(value) { return window.escapeHtml(value); };

BulkOrderApp.num = function(value) {
  const parsed = Number(String(value || '0').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

BulkOrderApp.unitPrice = function(size, sleeve) {
  const product = BulkOrderApp.selectedProduct();
  if (!product) return 0;
  let price = BulkOrderApp.num(product.harga) + BulkOrderApp.num(document.getElementById('bulkExtra').value);
  if (String(product.kategori || '').toLowerCase().includes('kaos')) {
    if (sleeve === 'Lengan Panjang') price += CONFIG.surcharge.lenganPanjang;
    if (size === 'XXL') price += CONFIG.surcharge.xxl;
    if (size === '3XL') price += CONFIG.surcharge.xxxl;
  }
  return Math.max(0, price);
};

BulkOrderApp.discount = function(unit, qty) {
  const type = document.getElementById('bulkDiscountType').value;
  const value = BulkOrderApp.num(document.getElementById('bulkDiscountValue').value);
  if (value < 0 || (type === 'percent' && value > 100) || (type === 'nominal' && value > unit)) return { invalid: true, subtotal: unit * qty, total: unit * qty, discount: 0 };
  const perUnit = type === 'percent' ? unit * value / 100 : value;
  return { invalid: false, subtotal: unit * qty, discount: perUnit * qty, total: (unit - perUnit) * qty };
};

BulkOrderApp.renderOptions = function() {
  const productSelect = document.getElementById('bulkProduct');
  const previous = productSelect.value;
  productSelect.innerHTML = '<option value="">Pilih produk</option>' + BulkOrderApp.state.products.map((product) => `<option value="${BulkOrderApp.esc(product.id)}">${BulkOrderApp.esc(product.nama)} - ${fmt(product.harga)}</option>`).join('');
  productSelect.value = previous && BulkOrderApp.state.products.some((product) => product.id === previous) ? previous : (BulkOrderApp.state.products[0]?.id || '');
  document.getElementById('bulkStatus').innerHTML = BulkOrderApp.statuses.map((status) => `<option>${BulkOrderApp.esc(status)}</option>`).join('');
  document.getElementById('bulkAccount').innerHTML = BulkOrderApp.state.accounts.map((account) => `<option>${BulkOrderApp.esc(account.nama)}</option>`).join('') || '<option>Kas</option>';
};

BulkOrderApp.renderMatrix = function() {
  BulkOrderApp.captureMatrix();
  const sizes = BulkOrderApp.sizes();
  const colors = BulkOrderApp.colors();
  BulkOrderApp.state.rows = BulkOrderApp.state.rows.map((row) => ({ ...row, warna: colors.includes(row.warna) ? row.warna : colors[0], lengan: row.lengan || 'Lengan Pendek' }));
  document.getElementById('matrixHead').innerHTML = `<tr><th>Warna</th><th>Lengan</th>${sizes.map((size) => `<th>${BulkOrderApp.esc(size)}</th>`).join('')}<th></th></tr>`;
  document.getElementById('matrixBody').innerHTML = BulkOrderApp.state.rows.map((row, index) => `<tr data-row="${index}"><td><select class="matrix-row-select" data-row-color="${index}">${colors.map((color) => `<option${color === row.warna ? ' selected' : ''}>${BulkOrderApp.esc(color)}</option>`).join('')}</select></td><td><select class="matrix-row-select" data-row-sleeve="${index}"><option${row.lengan === 'Lengan Pendek' ? ' selected' : ''}>Lengan Pendek</option><option${row.lengan === 'Lengan Panjang' ? ' selected' : ''}>Lengan Panjang</option></select></td>${sizes.map((size) => `<td><input class="matrix-input" type="number" min="0" step="1" value="${row.qty?.[size] || ''}" data-row-qty="${index}" data-size="${BulkOrderApp.esc(size)}" aria-label="Qty ${BulkOrderApp.esc(row.warna)} ${BulkOrderApp.esc(row.lengan)} ukuran ${BulkOrderApp.esc(size)}" /></td>`).join('')}<td><button class="remove-row" type="button" data-remove-row="${index}" title="Hapus baris" aria-label="Hapus baris">x</button></td></tr>`).join('');
  BulkOrderApp.recalculate();
};

BulkOrderApp.captureMatrix = function() {
  document.querySelectorAll('[data-row-qty]').forEach((input) => {
    const row = BulkOrderApp.state.rows[Number(input.dataset.rowQty)];
    if (!row) return;
    row.qty = row.qty || {};
    row.qty[input.dataset.size] = Math.max(0, Math.floor(BulkOrderApp.num(input.value)));
  });
};

BulkOrderApp.matrixItems = function() {
  const items = [];
  document.querySelectorAll('[data-row-qty]').forEach((input) => {
    const qty = Math.max(0, Math.floor(BulkOrderApp.num(input.value)));
    if (!qty) return;
    const row = BulkOrderApp.state.rows[Number(input.dataset.rowQty)];
    items.push({ size: input.dataset.size, warna: row.warna, lengan: row.lengan, qty });
  });
  return items;
};

BulkOrderApp.recalculate = function() {
  const items = BulkOrderApp.matrixItems();
  let qty = 0; let subtotal = 0; let discount = 0; let total = 0; let invalid = false;
  for (const item of items) {
    const calculation = BulkOrderApp.discount(BulkOrderApp.unitPrice(item.size, item.lengan), item.qty);
    qty += item.qty; subtotal += calculation.subtotal; discount += calculation.discount; total += calculation.total; invalid = invalid || calculation.invalid;
  }
  document.getElementById('totalQty').textContent = `${qty} pcs`;
  document.getElementById('totalSubtotal').textContent = fmt(subtotal);
  document.getElementById('totalDiscount').textContent = fmt(discount);
  document.getElementById('totalFinal').textContent = fmt(total);
  const type = document.getElementById('bulkDiscountType').value;
  document.getElementById('bulkValidation').textContent = invalid ? (type === 'percent' ? 'Diskon persen harus 0-100%.' : 'Diskon nominal tidak boleh melebihi harga satuan.') : '';
  return { items, total, invalid };
};

BulkOrderApp.renderList = function() {
  const target = document.getElementById('bulkOrderList');
  if (!BulkOrderApp.state.orders.length) { target.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada pesanan massal.</td></tr>'; return; }
  target.innerHTML = BulkOrderApp.state.orders.map((order) => `<tr><td><strong>${BulkOrderApp.esc(order.nama_produk)}</strong><span class="sub">${BulkOrderApp.esc(order.nama_customer)}</span></td><td>${Number(order.qty_total || 0) || '-'}</td><td style="text-align:right">${fmt(order.total)}</td><td style="text-align:right">${fmt(order.nominal_dibayar)}<span class="sub">${BulkOrderApp.esc(order.status_bayar)}</span></td><td><span class="status-badge ${safeClassToken(order.status, 'baru')}">${BulkOrderApp.esc(order.status)}</span></td><td><button class="icon-btn" type="button" data-open-order="${BulkOrderApp.esc(order.id)}">Detail</button></td></tr>`).join('');
};

BulkOrderApp.loadOrders = async function() {
  BulkOrderApp.state.orders = await BulkOrderApp.getJson('/api/bulk-orders');
  BulkOrderApp.renderList();
};

BulkOrderApp.openOrder = async function(id) {
  const order = await BulkOrderApp.getJson(`/api/bulk-orders/${id}`);
  const payments = await BulkOrderApp.getJson(`/api/bulk-orders/${id}?action=payments`);
  const detail = document.getElementById('bulkDetail');
  detail.hidden = false;
  detail.innerHTML = `<div class="detail-items"><h3>${BulkOrderApp.esc(order.nama_produk)} - ${BulkOrderApp.esc(order.nama_customer)}</h3><div class="list-actions"><select id="detailStatus">${BulkOrderApp.statuses.map((status) => `<option${status === order.status ? ' selected' : ''}>${BulkOrderApp.esc(status)}</option>`).join('')}</select><button class="icon-btn" type="button" data-save-status="${BulkOrderApp.esc(order.id)}">Simpan status</button><input id="detailPayment" inputmode="numeric" placeholder="Tambah bayar" /><select id="detailAccount">${document.getElementById('bulkAccount').innerHTML}</select><button class="icon-btn primary" type="button" data-add-payment="${BulkOrderApp.esc(order.id)}">Tambah bayar</button></div><div class="table-wrap"><table><thead><tr><th>Varian</th><th>Qty</th><th>Harga / pcs</th><th>Diskon / pcs</th><th>Total</th></tr></thead><tbody>${order.items.map((item) => `<tr><td>${BulkOrderApp.esc(`${item.warna}, ${item.size}, ${item.lengan}`)}</td><td>${item.qty}</td><td>${fmt(item.harga_satuan_normal)}</td><td>${fmt(item.discount_per_unit)}</td><td>${fmt(item.total)}</td></tr>`).join('')}</tbody></table></div><div class="table-wrap"><table><thead><tr><th>Waktu</th><th>Tipe</th><th>Akun</th><th>Nominal</th><th></th></tr></thead><tbody>${payments.map((payment) => `<tr><td>${new Date(payment.created_at).toLocaleString('id-ID')}</td><td>${BulkOrderApp.esc(payment.tipe)}</td><td>${BulkOrderApp.esc(payment.akun)}</td><td>${fmt(payment.nominal)}</td><td>${payment.nominal > 0 && ['DP', 'Pelunasan', 'Cicilan'].includes(payment.tipe) ? `<button class="icon-btn danger" type="button" data-void-payment="${BulkOrderApp.esc(payment.id)}" data-order-id="${BulkOrderApp.esc(order.id)}">Koreksi</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="5">Belum ada pembayaran.</td></tr>'}</tbody></table></div></div>`;
};

BulkOrderApp.submit = async function(event) {
  event.preventDefault();
  const calculated = BulkOrderApp.recalculate();
  if (calculated.invalid || !calculated.items.length) { showStatus(calculated.invalid ? 'Perbaiki diskon sebelum menyimpan.' : 'Isi minimal satu qty pesanan.', false); return; }
  const payload = {
    id_produk: document.getElementById('bulkProduct').value,
    nama_customer: document.getElementById('bulkCustomer').value,
    kontak: document.getElementById('bulkContact').value,
    status: document.getElementById('bulkStatus').value,
    cuttingan: document.getElementById('bulkCutting').value,
    tambahan_harga_per_pcs: BulkOrderApp.num(document.getElementById('bulkExtra').value),
    discount_type: document.getElementById('bulkDiscountType').value,
    discount_value: BulkOrderApp.num(document.getElementById('bulkDiscountValue').value),
    nominal_dibayar: BulkOrderApp.num(document.getElementById('bulkPayment').value),
    akun: document.getElementById('bulkAccount').value,
    catatan: document.getElementById('bulkNote').value,
    items: calculated.items,
  };
  const button = document.getElementById('bulkSubmit'); button.disabled = true;
  try {
    await BulkOrderApp.getJson('/api/bulk-orders', { method: 'POST', headers: BulkOrderApp.auth(true), body: JSON.stringify(payload) });
    showStatus('Pesanan massal tersimpan.', true);
    document.getElementById('bulkOrderForm').reset();
    BulkOrderApp.state.rows = [{ warna: BulkOrderApp.colors()[0], lengan: 'Lengan Pendek' }];
    BulkOrderApp.renderMatrix();
    await BulkOrderApp.loadOrders();
  } catch (error) { showStatus(error.message, false); } finally { button.disabled = false; }
};

BulkOrderApp.bind = function() {
  document.getElementById('bulkProduct').addEventListener('change', BulkOrderApp.renderMatrix);
  ['bulkExtra', 'bulkDiscountType', 'bulkDiscountValue'].forEach((id) => document.getElementById(id).addEventListener('input', BulkOrderApp.recalculate));
  document.getElementById('addMatrixRow').addEventListener('click', () => { BulkOrderApp.state.rows.push({ warna: BulkOrderApp.colors()[0], lengan: 'Lengan Pendek' }); BulkOrderApp.renderMatrix(); });
  document.getElementById('matrixBody').addEventListener('input', (event) => { if (event.target.dataset.rowQty !== undefined) BulkOrderApp.recalculate(); });
  document.getElementById('matrixBody').addEventListener('change', (event) => {
    const target = event.target; const rowIndex = target.dataset.rowColor ?? target.dataset.rowSleeve;
    if (rowIndex !== undefined) { const row = BulkOrderApp.state.rows[Number(rowIndex)]; if (target.dataset.rowColor !== undefined) row.warna = target.value; else row.lengan = target.value; BulkOrderApp.recalculate(); }
  });
  document.getElementById('matrixBody').addEventListener('click', (event) => { const row = event.target.dataset.removeRow; if (row !== undefined && BulkOrderApp.state.rows.length > 1) { BulkOrderApp.captureMatrix(); BulkOrderApp.state.rows.splice(Number(row), 1); BulkOrderApp.renderMatrix(); } });
  document.getElementById('bulkOrderForm').addEventListener('submit', BulkOrderApp.submit);
  document.getElementById('refreshBulkList').addEventListener('click', () => BulkOrderApp.loadOrders().catch((error) => showStatus(error.message, false)));
  document.getElementById('bulkOrderList').addEventListener('click', (event) => { const id = event.target.dataset.openOrder; if (id) BulkOrderApp.openOrder(id).catch((error) => showStatus(error.message, false)); });
  document.getElementById('bulkDetail').addEventListener('click', async (event) => {
    const orderId = event.target.dataset.addPayment || event.target.dataset.saveStatus || event.target.dataset.orderId;
    if (!orderId) return;
    try {
      if (event.target.dataset.addPayment) await BulkOrderApp.getJson(`/api/bulk-orders/${orderId}?action=payment`, { method: 'PUT', headers: BulkOrderApp.auth(true), body: JSON.stringify({ tambah: BulkOrderApp.num(document.getElementById('detailPayment').value), akun: document.getElementById('detailAccount').value }) });
      if (event.target.dataset.saveStatus) await BulkOrderApp.getJson(`/api/bulk-orders/${orderId}?action=status`, { method: 'PUT', headers: BulkOrderApp.auth(true), body: JSON.stringify({ status: document.getElementById('detailStatus').value }) });
      if (event.target.dataset.voidPayment) await BulkOrderApp.getJson(`/api/bulk-orders/${orderId}?action=void-payment`, { method: 'PUT', headers: BulkOrderApp.auth(true), body: JSON.stringify({ payment_id: event.target.dataset.voidPayment }) });
      await BulkOrderApp.loadOrders(); await BulkOrderApp.openOrder(orderId); showStatus('Perubahan tersimpan.', true);
    } catch (error) { showStatus(error.message, false); }
  });
};

BulkOrderApp.boot = async function() {
  const [products, accounts] = await Promise.all([BulkOrderApp.getJson('/api/products'), BulkOrderApp.getJson('/api/accounts')]);
  BulkOrderApp.state.products = products || [];
  BulkOrderApp.state.accounts = accounts || [];
  BulkOrderApp.renderOptions();
  BulkOrderApp.renderMatrix();
  BulkOrderApp.bind();
  await BulkOrderApp.loadOrders();
};
