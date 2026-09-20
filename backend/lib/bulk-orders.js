import { calculateOrderPricing, computeStatusBayar, normVariant, toNumSafe } from './helpers.js';

export const BULK_ORDER_STATUSES = ['Menunggu DP', 'Siap Produksi', 'Diproses', 'Selesai Produksi', 'Siap Diambil', 'Diambil', 'Batal'];
export const ACTIVE_BULK_STOCK_STATUSES = ['Siap Produksi', 'Diproses'];

const DEFAULT_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL'];
const DEFAULT_COLORS = ['Putih', 'Hitam', 'Abu-abu', 'Navy', 'Maroon', 'Kuning', 'Hijau Botol', 'Baby Blue', 'Krem', 'Merah'];
const DEFAULT_SLEEVES = ['Lengan Pendek', 'Lengan Panjang'];
const SURCHARGE = { lenganPanjang: 10000, xxl: 5000, xxxl: 10000 };

function productOptions(value, fallback) {
  const values = String(value || '').split('|').map((part) => part.trim()).filter(Boolean);
  return values.length ? [...new Set(values)] : fallback;
}

function unitSurcharge(size, sleeve) {
  let extra = sleeve === 'Lengan Panjang' ? SURCHARGE.lenganPanjang : 0;
  if (size === 'XXL') extra += SURCHARGE.xxl;
  if (size === '3XL') extra += SURCHARGE.xxxl;
  return extra;
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
    const hargaSatuanNormal = Math.max(0, toNumSafe(product.harga)) + surcharge + tambahanHarga;
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
