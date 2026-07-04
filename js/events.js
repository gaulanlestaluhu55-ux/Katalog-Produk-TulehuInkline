/* ═══════════════════════════════════════════════════════
   EVENT DELEGATION
═══════════════════════════════════════════════════════ */
document.getElementById('productGrid').addEventListener('click', e => {
  const arrow = e.target.closest('.gallery-arrow');
  if (arrow) {
    e.stopPropagation();
    const gallery = arrow.closest('.gallery');
    const active = +gallery.dataset.active || 0;
    setActiveSlide(gallery, active + (+arrow.dataset.dir));
    return;
  }

  const dot = e.target.closest('.gallery-dot');
  if (dot) {
    e.stopPropagation();
    const gallery = dot.closest('.gallery');
    setActiveSlide(gallery, +dot.dataset.dot);
    return;
  }

  const toggleBtn = e.target.closest('.toggle-options-btn');
  if (toggleBtn) {
    const idx = +toggleBtn.dataset.idx;
    setCardExpanded(idx, !expanded[idx]);
    return;
  }

  const pill = e.target.closest('.pill');
  if (pill) {
    const idx   = +pill.dataset.idx;
    const group = pill.dataset.group;
    const val   = pill.dataset.val;
    pill.closest('.pill-row').querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));
    pill.classList.add('selected');
    state[idx][group] = val;
    refreshCard(allProducts[idx], idx);
    return;
  }

  const qBtn = e.target.closest('.qty-btn');
  if (qBtn) {
    const idx    = +qBtn.dataset.idx;
    const action = qBtn.dataset.action;
    let qty = state[idx].qty;
    if (action === 'minus' && qty > 1)  qty--;
    if (action === 'plus'  && qty < 999) qty++;
    state[idx].qty = qty;
    document.getElementById('qty-val-' + idx).textContent = qty;
    refreshCard(allProducts[idx], idx);
    return;
  }

  const oBtn = e.target.closest('.order-btn');
  if (oBtn) {
    const idx = +oBtn.dataset.idx;
    if (oBtn.classList.contains('disabled')) {
      // Belum lengkap milih opsi -> buka card-nya biar user langsung pilih
      setCardExpanded(idx, true);
      oBtn.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const msg = buildOrderMsg(allProducts[idx], idx);
    window.open(`https://wa.me/${CONFIG.waNumber}?text=${encodeURIComponent(msg)}`, '_blank');
  }
});
