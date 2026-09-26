/* ═══════════════════════════════════════════════════════
   KONFIGURASI — edit sesuai kebutuhan
═══════════════════════════════════════════════════════ */
const CONFIG = {
  apiUrl: 'https://katalog-produk-tulehu-inkline.vercel.app',
  waNumber: '628218025886',
  waDefaultMsg: 'Halo Tulehu Inkline! Saya mau tanya tentang produk sablon.',
  surcharge: {
    lenganPanjang: 10000,
    xxl: 5000,
    xxxl: 10000,
  },
  kaos: {
    /* Dewasa: XS sama harga dengan S-XL. Anak: No.2-14 harga flat (lihat hargaAnak). */
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '2', '4', '6', '8', '10', '12', '14'],
    sizesDewasa: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
    sizesAnak: ['2', '4', '6', '8', '10', '12', '14'],
    /* Flat absolut semua produk: 2-8 = 70rb, 10-14 = 80rb; lengan panjang +10rb. */
    hargaAnak: { kecil: 70000, besar: 80000 },
    usiaAnak: { '2': '1-2 thn', '4': '3-4 thn', '6': '5-6 thn', '8': '7-8 thn', '10': '9-10 thn', '12': '11-12 thn', '14': '13-14 thn' },
    sleeves: ['Lengan Pendek', 'Lengan Panjang'],
    colors: ['Putih', 'Hitam', 'Abu-abu', 'Navy', 'Maroon', 'Kuning', 'Hijau Botol', 'Baby Blue', 'Krem', 'Merah'],
  },
  jersey: {
    nameSets: ['Nama saja', 'Angka saja', 'Nama + Angka'],
  },
  categories: {
    Masuk: ['Penjualan', 'Modal', 'Pendapatan Lain'],
    Keluar: ['Bahan Baku', 'Ongkos Kirim', 'Gaji Karyawan', 'Operasional', 'Marketing', 'Biaya Hidup', 'Angsuran', 'Lainnya'],
  },
  /* Landing page (index.html) — link publik, aman di git */
  landing: {
    instagram: 'https://www.instagram.com/sablonkaostulehu?stkn=czVyc3ptZTVvZWQ5',
    shopee: 'https://id.shp.ee/ezeEQjji',
    tiktok: 'https://www.tiktok.com/@sablonkaostulehu?_r=1&_t=ZS-99dWMAwKxOO',
    /* Hero responsif: mobile ≤767px, desktop di atasnya */
    heroMobile: 'https://res.cloudinary.com/rodryv2e/image/upload/v1789106937/mobile_ub38cy.webp',
    heroDesktop: 'https://res.cloudinary.com/rodryv2e/image/upload/v1789106937/desktop_b6wayg.webp',
  }
};
window.CONFIG = CONFIG;
