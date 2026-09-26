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

/* D2: opsi per produk (kolom DB sizes/colors, pipe-separated).
   '' / kosong = fallback daftar global CONFIG. Sleeves tetap global. */
function splitPipeList(value) {
  const parts = String(value ?? '').split('|').map(s => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}

function productSizes(p) {
  const list = splitPipeList(p && p.sizes);
  return list.length ? list : [...CONFIG.kaos.sizes];
}

function productColors(p) {
  const list = splitPipeList(p && p.colors);
  return list.length ? list : [...CONFIG.kaos.colors];
}

function fmt(n) {
  if (isNaN(n) || n === null) return '–';
  return 'Rp\u00a0' + Math.round(n).toLocaleString('id-ID');
}

function toNum(raw) {
  const n = parseInt(String(raw || '0').replace(/\D/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

/* Ukuran anak: No.2-14 (flat 70/80rb, abaikan harga produk). XS = harga S-XL. */
function isAnakSize(size) {
  return Array.isArray(CONFIG.kaos.sizesAnak) && CONFIG.kaos.sizesAnak.includes(String(size));
}

function getKidsBase(size) {
  const s = String(size);
  if (['2', '4', '6', '8'].includes(s)) return CONFIG.kaos.hargaAnak.kecil;
  if (['10', '12', '14'].includes(s)) return CONFIG.kaos.hargaAnak.besar;
  return 0;
}

function getKaosBase(p, size) {
  if (isAnakSize(size)) return getKidsBase(size);
  return toNum(p.harga);
}

/* Label pills: anak tampil usia, mis. "2 · 1-2 thn". Nilai data-val tetap angka. */
function sizeDisplayLabel(size) {
  const s = String(size);
  const usia = CONFIG.kaos.usiaAnak && CONFIG.kaos.usiaAnak[s];
  return usia ? `${s} · ${usia}` : s;
}

function getSurcharge(s) {
  let extra = 0;
  if (s.sleeve === 'Lengan Panjang') extra += CONFIG.surcharge.lenganPanjang;
  if (isAnakSize(s.size)) return extra;
  if (s.size === 'XXL') extra += CONFIG.surcharge.xxl;
  if (s.size === '3XL') extra += CONFIG.surcharge.xxxl;
  return extra;
}

function getUnitPriceKaos(p, idx) {
  const s = state[idx] || {};
  const base = getKaosBase(p, s.size);
  return base + getSurcharge(s);
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
