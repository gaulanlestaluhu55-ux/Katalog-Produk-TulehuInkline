/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
function isKaos(p) {
  return (p.kategori || '').toLowerCase().includes('kaos');
}

function isJersey(p) {
  return (p.kategori || '').toLowerCase().includes('jersey');
}

function hasOptions(p) {
  return isKaos(p) || isJersey(p);
}

function resolveImgUrl(url) {
  if (!url) return '';
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) {
    return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
  }
  return url;
}

function cloudinaryOptimize(url) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  if (url.includes('/upload/f_auto')) return url; // already optimized
  return url.replace('/upload/', '/upload/f_auto,q_auto,w_800/');
}

function getImageUrls(p) {
  if (!p.gambar) return [];
  return String(p.gambar)
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(resolveImgUrl)
    .map(cloudinaryOptimize);
}

function fmt(n) {
  if (isNaN(n) || n === null) return '–';
  return 'Rp\u00a0' + Math.round(n).toLocaleString('id-ID');
}

function toNum(raw) {
  const n = parseInt(String(raw || '0').replace(/\D/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function getSurcharge(s) {
  let extra = 0;
  if (s.sleeve === 'Lengan Panjang') extra += CONFIG.surcharge.lenganPanjang;
  if (s.size === 'XXL') extra += CONFIG.surcharge.xxl;
  if (s.size === '3XL') extra += CONFIG.surcharge.xxxl;
  return extra;
}

function getUnitPriceKaos(p, idx) {
  const base = toNum(p.harga);
  return base + getSurcharge(state[idx]);
}

function getNameSetPrice(p, ns) {
  if (!ns) return 0;
  if (ns === 'Nama saja')    return toNum(p.harga_nama);
  if (ns === 'Angka saja')   return toNum(p.harga_angka);
  if (ns === 'Nama + Angka') return toNum(p.harga_nama_angka);
  return 0;
}

function getUnitPriceJersey(p, idx) {
  const base   = toNum(p.harga);
  const nsPrice = getNameSetPrice(p, state[idx].nameset);
  return base + nsPrice;
}

function getUnitPrice(p, idx) {
  if (isKaos(p))   return getUnitPriceKaos(p, idx);
  if (isJersey(p)) return getUnitPriceJersey(p, idx);
  return toNum(p.harga);
}

function getTotalPrice(p, idx) {
  return getUnitPrice(p, idx) * state[idx].qty;
}

function isOrderReady(p, idx) {
  const s = state[idx];
  if (isKaos(p))   return s.size && s.sleeve && s.color;
  if (isJersey(p)) return !!s.nameset;
  return true;
}
