/* ═══════════════════════════════════════════════════════
   FILTER & SEARCH
═══════════════════════════════════════════════════════ */
let activeCategory = 'semua';

function filterAndRender() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const filtered = allProducts.reduce((acc, p, i) => {
    const matchCat = activeCategory === 'semua' || (p.kategori||'').toLowerCase() === activeCategory;
    const matchQ   = !q
      || p.nama.toLowerCase().includes(q)
      || (p.deskripsi||'').toLowerCase().includes(q)
      || (p.kategori||'').toLowerCase().includes(q);
    if (matchCat && matchQ) acc.push({ p, i });
    return acc;
  }, []);

  const grid = document.getElementById('productGrid');
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <p>Produk tidak ditemukan.<br/>Coba kata kunci atau kategori lain.</p>
    </div>`;
    return;
  }
  grid.innerHTML = filtered.map(({ p, i }) => renderCard(p, i)).join('');

  // Set ulang max-height untuk card yang sedang expanded (karena innerHTML baru direset)
  filtered.forEach(({ i }) => {
    if (expanded[i]) {
      const wrap = document.getElementById('opts-wrap-' + i);
      if (wrap) wrap.style.maxHeight = wrap.scrollHeight + 'px';
    }
  });
}

function buildFilters() {
  const cats = [...new Set(allProducts.map(p => (p.kategori||'').toLowerCase()).filter(Boolean))];
  const wrap = document.getElementById('filterBtns');
  wrap.innerHTML = '<button class="filter-btn active" data-cat="semua">Semua</button>';
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.cat = cat;
    btn.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
    wrap.appendChild(btn);
  });
  wrap.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    wrap.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.cat;
    filterAndRender();
  });
}

document.getElementById('searchInput').addEventListener('input', filterAndRender);
