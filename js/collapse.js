/* ═══════════════════════════════════════════════════════
   COLLAPSE / EXPAND CARD OPTIONS
═══════════════════════════════════════════════════════ */
function setCardExpanded(idx, value) {
  expanded[idx] = value;
  const cardEl = document.querySelector(`.card[data-idx="${idx}"]`);
  if (!cardEl) return;

  cardEl.classList.toggle('expanded', value);

  const wrap = document.getElementById('opts-wrap-' + idx);
  if (wrap) {
    wrap.style.maxHeight = value ? wrap.scrollHeight + 'px' : '0px';
  }

  const toggleLabel = cardEl.querySelector('.toggle-options-btn span');
  if (toggleLabel) toggleLabel.textContent = value ? 'Sembunyikan opsi' : 'Pilih Opsi';
}
