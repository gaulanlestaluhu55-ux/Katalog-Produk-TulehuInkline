/* ═══════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════ */
function waIconSVG() {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
}

function chevronSVG() {
  return `<svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
}

function pillsHtml(items, group, idx, labelFn) {
  return items.map(val => {
    const extra = labelFn ? labelFn(val) : '';
    return `<button class="pill" data-group="${group}" data-idx="${idx}" data-val="${val}">
      ${val}${extra ? `<span class="pill-extra">${extra}</span>` : ''}
    </button>`;
  }).join('');
}

function sizeSurchargeLabel(val) {
  if (val === 'XXL') return `+${fmt(CONFIG.surcharge.xxl).replace('Rp\u00a0','')}`;
  if (val === '3XL') return `+${fmt(CONFIG.surcharge.xxxl).replace('Rp\u00a0','')}`;
  return '';
}

function sleeveSurchargeLabel(val) {
  if (val === 'Lengan Panjang') return `+${fmt(CONFIG.surcharge.lenganPanjang).replace('Rp\u00a0','')}`;
  return '';
}

function nameSetLabel(p) {
  return val => {
    let price = 0;
    if (val === 'Nama saja')    price = toNum(p.harga_nama);
    if (val === 'Angka saja')   price = toNum(p.harga_angka);
    if (val === 'Nama + Angka') price = toNum(p.harga_nama_angka);
    return price > 0 ? `+${price.toLocaleString('id-ID')}` : '';
  };
}

function priceBlockHtml(p, idx) {
  const s = state[idx];
  const unit  = getUnitPrice(p, idx);
  const total = getTotalPrice(p, idx);
  const base  = toNum(p.harga);

  if (!isOrderReady(p, idx) && isKaos(p)) {
    return `<div class="price-block">
      <span class="price-unit">Mulai dari</span>
      <span class="price-total">${fmt(base)}<span style="font-size:11px;font-weight:400;color:var(--ink-muted)">${p.satuan||'/pcs'}</span></span>
      <span class="price-breakdown">Pilih ukuran, lengan & warna</span>
    </div>`;
  }

  if (!isOrderReady(p, idx) && isJersey(p)) {
    return `<div class="price-block">
      <span class="price-unit">Mulai dari</span>
      <span class="price-total">${fmt(base)}<span style="font-size:11px;font-weight:400;color:var(--ink-muted)">${p.satuan||'/pcs'}</span></span>
      <span class="price-breakdown">Pilih jenis name set</span>
    </div>`;
  }

  const surcharge = isKaos(p) ? getSurcharge(s) : 0;
  const breakdown = surcharge > 0
    ? `${fmt(base)} + surcharge ${fmt(surcharge)} = ${fmt(unit)}/pcs`
    : `${fmt(unit)}${p.satuan||'/pcs'}`;

  return `<div class="price-block">
    <span class="price-unit">${s.qty} pcs × ${fmt(unit)}</span>
    <span class="price-total">${fmt(total)}</span>
    ${surcharge > 0 ? `<span class="price-breakdown">${breakdown}</span>` : ''}
  </div>`;
}

function renderGallery(images, idx, name) {
  if (!images.length) {
    return `<div class="card-img-placeholder">No Image</div>`;
  }

  if (images.length === 1) {
    return `<div class="gallery single" data-idx="${idx}" data-count="1" data-active="0">
      <div class="gallery-track">
        <div class="gallery-slide">
          <img src="${images[0]}" alt="${name}" loading="lazy" onerror="this.closest('.gallery').innerHTML='<div class=card-img-placeholder>No Image</div>'">
        </div>
      </div>
    </div>`;
  }

  const slides = images.map((url, i) => `
    <div class="gallery-slide">
      <img src="${url}" alt="${name} ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" onerror="this.style.opacity='0'">
    </div>`).join('');

  const dots = images.map((_, i) => `<button class="gallery-dot${i === 0 ? ' active' : ''}" data-dot="${i}" data-idx="${idx}" aria-label="Gambar ${i + 1}"></button>`).join('');

  return `<div class="gallery" data-idx="${idx}" data-count="${images.length}" data-active="0">
    <div class="gallery-track">${slides}</div>
    <button class="gallery-arrow gallery-prev" data-dir="-1" data-idx="${idx}" aria-label="Sebelumnya">‹</button>
    <button class="gallery-arrow gallery-next" data-dir="1" data-idx="${idx}" aria-label="Berikutnya">›</button>
    <div class="gallery-dots">${dots}</div>
    <div class="gallery-counter">1 / ${images.length}</div>
  </div>`;
}

function renderCard(p, idx) {
  initState(idx);

  const images = getImageUrls(p);
  const imgHtml = renderGallery(images, idx, p.nama);

  const badgeHtml = p.badge ? `<span class="card-badge">${p.badge}</span>` : '';

  let optionsHtml = '';

  if (isKaos(p)) {
    optionsHtml = `
      <div class="options-block">
        <div class="opt-group">
          <div class="opt-label">Ukuran</div>
          <div class="pill-row">${pillsHtml(CONFIG.kaos.sizes, 'size', idx, sizeSurchargeLabel)}</div>
        </div>
        <div class="opt-group">
          <div class="opt-label">Jenis Lengan</div>
          <div class="pill-row">${pillsHtml(CONFIG.kaos.sleeves, 'sleeve', idx, sleeveSurchargeLabel)}</div>
        </div>
        <div class="opt-group">
          <div class="opt-label">Warna</div>
          <div class="pill-row">${pillsHtml(CONFIG.kaos.colors, 'color', idx, null)}</div>
        </div>
        <div class="opt-group">
          <div class="opt-label">Jumlah</div>
          <div class="qty-row">
            <button class="qty-btn" data-action="minus" data-idx="${idx}">−</button>
            <span class="qty-val" id="qty-val-${idx}">1</span>
            <button class="qty-btn" data-action="plus" data-idx="${idx}">+</button>
            <span style="font-size:12px;color:var(--ink-muted)">pcs</span>
          </div>
        </div>
      </div>`;
  }

  if (isJersey(p)) {
    optionsHtml = `
      <div class="options-block">
        <div class="jersey-info">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Bahan jersey dibawa sendiri oleh customer
        </div>
        <div class="opt-group">
          <div class="opt-label">Name Set</div>
          <div class="pill-row">${pillsHtml(CONFIG.jersey.nameSets, 'nameset', idx, nameSetLabel(p))}</div>
        </div>
        <div class="opt-group">
          <div class="opt-label">Jumlah</div>
          <div class="qty-row">
            <button class="qty-btn" data-action="minus" data-idx="${idx}">−</button>
            <span class="qty-val" id="qty-val-${idx}">1</span>
            <button class="qty-btn" data-action="plus" data-idx="${idx}">+</button>
            <span style="font-size:12px;color:var(--ink-muted)">pcs</span>
          </div>
        </div>
      </div>`;
  }

  const isExpanded = !!expanded[idx];
  const toggleBtnHtml = optionsHtml ? `
      <button class="toggle-options-btn" data-idx="${idx}" data-action="toggle">
        <span>${isExpanded ? 'Sembunyikan opsi' : 'Pilih Opsi'}</span>
        ${chevronSVG()}
      </button>` : '';

  const collapsibleHtml = optionsHtml
    ? `<div class="options-collapsible" id="opts-wrap-${idx}">${optionsHtml}</div>`
    : '';

  return `
    <div class="card${isExpanded ? ' expanded' : ''}" data-idx="${idx}">
      <div class="card-img-wrap">${imgHtml}${badgeHtml}</div>
      <div class="card-body">
        <div class="card-name">${p.nama}</div>
        ${p.deskripsi ? `<div class="card-desc">${p.deskripsi}</div>` : ''}
        ${Number(p.sold_count) > 0 ? `<div class="card-sold">${Number(p.sold_count).toLocaleString('id-ID')} terjual</div>` : ''}
      </div>
      ${toggleBtnHtml}
      ${collapsibleHtml}
      <div class="card-footer" id="footer-${idx}">
        <div id="price-block-${idx}">${priceBlockHtml(p, idx)}</div>
        <button class="order-btn${isOrderReady(p, idx) ? '' : ' disabled'}" id="order-btn-${idx}" data-idx="${idx}">
          ${waIconSVG()} Order WA
        </button>
      </div>
    </div>`;
}

function refreshCard(p, idx) {
  const pb = document.getElementById('price-block-' + idx);
  if (pb) pb.innerHTML = priceBlockHtml(p, idx);

  const btn = document.getElementById('order-btn-' + idx);
  if (btn) {
    if (isOrderReady(p, idx)) {
      btn.classList.remove('disabled');
    } else {
      btn.classList.add('disabled');
    }
  }
}
