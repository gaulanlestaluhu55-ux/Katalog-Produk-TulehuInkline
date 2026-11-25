import { calculateOrderPricing, computeStatusBayar, normVariant, toNumSafe } from './helpers.js';

export const BULK_ORDER_STATUSES = ['Menunggu DP', 'Siap Produksi', 'Diproses', 'Selesai Produksi', 'Siap Diambil', 'Diambil', 'Batal'];
export const ACTIVE_BULK_STOCK_STATUSES = ['Siap Produksi', 'Diproses'];

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '2', '4', '6', '8', '10', '12', '14'];
const DEFAULT_COLORS = ['Putih', 'Hitam', 'Abu-abu', 'Navy', 'Maroon', 'Kuning', 'Hijau Botol', 'Baby Blue', 'Krem', 'Merah'];
const DEFAULT_SLEEVES = ['Lengan Pendek', 'Lengan Panjang'];
const SURCHARGE = { lenganPanjang: 10000, xxl: 5000, xxxl: 10000, fourxl: 15000, fivexl: 20000 };
/* Harga anak flat absolut (cermin js/config.js): 2-8 = 70rb, 10-14 = 80rb. */
const HARGA_ANAK_KECIL = 70000;
const HARGA_ANAK_BESAR = 80000;
const SIZES_ANAK = ['2', '4', '6', '8', '10', '12', '14'];

function isAnakSize(size) {
  return SIZES_ANAK.includes(String(size));
}

function kidsBase(size) {
  const s = String(size);
  if (['2', '4', '6', '8'].includes(s)) return HARGA_ANAK_KECIL;
  if (['10', '12', '14'].includes(s)) return HARGA_ANAK_BESAR;
  return 0;
}

function productOptions(value, fallback) {
  const values = String(value || '').split('|').map((part) => part.trim()).filter(Boolean);
  return values.length ? [...new Set(values)] : fallback;
}

function unitSurcharge(size, sleeve) {
  let extra = sleeve === 'Lengan Panjang' ? SURCHARGE.lenganPanjang : 0;
  if (isAnakSize(size)) return extra;
  if (size === 'XXL') extra += SURCHARGE.xxl;
  if (size === '3XL') extra += SURCHARGE.xxxl;
  if (size === '4XL') extra += SURCHARGE.fourxl;
  if (size === '5XL') extra += SURCHARGE.fivexl;
  return extra;
}

function basePrice(product, size) {
  if (isAnakSize(size)) return kidsBase(size);
  return Math.max(0, toNumSafe(product.harga));
}

function isKaosProduct(product) {
  return String(product.kategori || '').toLowerCase().includes('kaos');
}

export function buildBulkOrderPayload(body, product, accountNames) {
  const namaCustomer = String(body.nama_customer || '').trim();
  const status = String(body.status || 'Menunggu DP').trim();
  const cuttingan = normVariant('cuttingan', body.cuttingan || 'Reguler') || 'Reguler';
  const tambahanHarga = Math.max(0, toNumSafe(body.tambahan_harga_per_pcs));
  const discountType = String(body.discount_type || 'nominal').trim();
  const discountValue = toNumSafe(body.discount_value);
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const sizes = productOptions(product.sizes, DEFAULT_SIZES);
  const colors = productOptions(product.colors, DEFAULT_COLORS);

  if (!namaCustomer) throw new Error('Nama customer wajib diisi.');
  if (!BULK_ORDER_STATUSES.includes(status)) throw new Error('Status pesanan massal tidak valid.');
  if (!rawItems.length) throw new Error('Isi minimal satu qty pada matrix pesanan.');

  const items = rawItems.map((raw) => {
    const qty = Math.max(0, Math.floor(toNumSafe(raw.qty)));
    const size = normVariant('size', raw.size);
    const warna = normVariant('warna', raw.warna);
    const lengan = normVariant('lengan', raw.lengan);
    if (!qty) return null;
    if (!sizes.includes(size)) throw new Error(`Ukuran ${size || '-'} tidak tersedia untuk produk ini.`);
    if (!colors.includes(warna)) throw new Error(`Warna ${warna || '-'} tidak tersedia untuk produk ini.`);
    if (!DEFAULT_SLEEVES.includes(lengan)) throw new Error('Pilihan lengan tidak valid.');

    const surcharge = isKaosProduct(product) ? unitSurcharge(size, lengan) : 0;
    const hargaSatuanNormal = basePrice(product, size) + surcharge + tambahanHarga;
    const pricing = calculateOrderPricing({ hargaSatuan: hargaSatuanNormal, qty, discountType, discountValue });
    if (!pricing.ok) throw new Error(pricing.message);
    return {
      id_produk: product.id,
      nama_produk: product.nama,
      kategori: product.kategori || '',
      size,
      warna,
      lengan,
      cuttingan,
      qty: pricing.qty,
      harga_satuan_normal: pricing.unit,
      discount_type: pricing.discountType,
      discount_value: pricing.discountValue,
      discount_per_unit: pricing.discountPerUnit,
      harga_satuan_final: pricing.unit - pricing.discountPerUnit,
      subtotal: pricing.subtotal,
      total_discount: pricing.discountAmount,
      total: pricing.total,
    };
  }).filter(Boolean);

  if (!items.length) throw new Error('Isi minimal satu qty pada matrix pesanan.');
  const total = items.reduce((sum, item) => sum + item.total, 0);
  const initialPayment = Math.max(0, toNumSafe(body.nominal_dibayar));
  const akun = String(body.akun || '').trim();
  if (initialPayment > total) throw new Error('Nominal dibayar tidak boleh lebih besar dari total pesanan.');
  if (initialPayment > 0 && !accountNames.includes(akun)) throw new Error('Akun pembayaran tidak valid.');

  return {
    nama_customer: namaCustomer,
    kontak: String(body.kontak || '').trim(),
    status,
    catatan: String(body.catatan || '').trim(),
    id_produk: product.id,
    nama_produk: product.nama,
    kategori: product.kategori || '',
    cuttingan,
    tambahan_harga_per_pcs: tambahanHarga,
    nominal_dibayar: initialPayment,
    akun,
    items,
  };
}

export function bulkPaymentSnapshot(total, paid) {
  const nominalDibayar = Math.max(0, toNumSafe(paid));
  const totalFinal = Math.max(0, toNumSafe(total));
  return {
    nominal_dibayar: nominalDibayar,
    sisa: Math.max(0, totalFinal - nominalDibayar),
    status_bayar: computeStatusBayar(nominalDibayar, totalFinal),
  };
}

// Read-only MCP contract. Pricing remains sourced from the existing bulk-order builder.
export function getBulkBusinessRules() {
  return {
    contract: 'bulk-pricing-v1',
    currency: 'IDR',
    pricing_scope: 'bulk order backend; actual product price and options come from catalog',
    default_sizes: [...DEFAULT_SIZES],
    default_colors: [...DEFAULT_COLORS],
    sleeves: [...DEFAULT_SLEEVES],
    cuttingan: ['Reguler', 'Oversize'],
    adult_base: 'catalog product price',
    kaos_surcharge: {...SURCHARGE},
    kids_base: { '2-8': HARGA_ANAK_KECIL, '10-14': HARGA_ANAK_BESAR },
    kids_sizes: [...SIZES_ANAK],
    discount_types: ['nominal', 'percent'],
    discount_basis: 'per pcs',
    bulk_statuses: [...BULK_ORDER_STATUSES],
    active_bulk_stock_statuses: [...ACTIVE_BULK_STOCK_STATUSES],
  };
}

export function validateBulkPreviewInput(body) {
  const allowed = ['id_produk','cuttingan','tambahan_harga_per_pcs','discount_type','discount_value','items'];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const invalid = () => { throw new Error('Input simulasi tidak valid.'); };
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !allowed.includes(k)) || typeof body.id_produk !== 'string' || !uuid.test(body.id_produk)) invalid();
  if (body.cuttingan !== undefined && !['Reguler','Oversize'].includes(body.cuttingan)) invalid();
  const extra = body.tambahan_harga_per_pcs ?? 0;
  const discount = body.discount_value ?? 0;
  const type = body.discount_type ?? 'nominal';
  if (!Number.isSafeInteger(extra) || extra < 0 || extra > 10000000 ||
      !Number.isFinite(discount) || discount < 0 || discount > 10000000 ||
      !['nominal','percent'].includes(type) || (type === 'percent' && discount > 100)) invalid();
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) invalid();
  const seen = new Set();
  const items = body.items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).some(k => !['size','warna','lengan','qty'].includes(k)) ||
        !Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 10000 ||
        ['size','warna','lengan'].some(k => typeof item[k] !== 'string' || !item[k].trim() || item[k].length > 80)) invalid();
    const normalized = {size:normVariant('size',item.size),warna:normVariant('warna',item.warna),lengan:normVariant('lengan',item.lengan),qty:item.qty};
    const key = JSON.stringify([normalized.size,normalized.warna,normalized.lengan]);
    if (seen.has(key)) throw new Error('Varian duplikat. Gabungkan qty untuk varian yang sama.');
    seen.add(key);
    return normalized;
  });
  return {id_produk:body.id_produk,cuttingan:body.cuttingan ?? 'Reguler',tambahan_harga_per_pcs:extra,discount_type:type,discount_value:discount,items};
}

export function previewBulkOrder(body, product) {
  const input = validateBulkPreviewInput(body);
  if (!product || product.id !== input.id_produk || product.aktif !== true) throw new Error('Produk aktif tidak ditemukan.');
  // No customer, contact, payment, DB insert, or ledger mutation.
  const payload = buildBulkOrderPayload({...input,nama_customer:'Preview',nominal_dibayar:0}, product, []);
  const sums = payload.items.reduce((a,item)=>({
    qty_total:a.qty_total+item.qty,subtotal:a.subtotal+item.subtotal,
    total_discount:a.total_discount+item.total_discount,total:a.total+item.total
  }),{qty_total:0,subtotal:0,total_discount:0,total:0});
  return {contract:'bulk-pricing-v1',preview:true,persisted:false,id_produk:product.id,nama_produk:product.nama,
    cuttingan:payload.cuttingan,items:payload.items,...sums};
}