/* ═══════════════════════════════════════════════════════
   KONFIGURASI — edit sesuai kebutuhan
═══════════════════════════════════════════════════════ */
const CONFIG = {
  apiUrl: 'https://katalog-produk-tulehu-inkline.vercel.app',
  waNumber: '628218025886',
  waDefaultMsg: 'Halo Tulehu Inkline! Saya mau tanya tentang produk sablon.',
  surcharge: {
    lenganPanjang: 10000,
    xxl: 10000,
    xxxl: 20000,
  },
  kaos: {
    sizes: ['S', 'M', 'L', 'XL', 'XXL', '3XL'],
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
    /* Hero responsif: mobile ≤767px, desktop di atasnya */
    heroMobile: 'https://res.cloudinary.com/rodryv2e/image/upload/v1789106937/mobile_ub38cy.webp',
    heroDesktop: 'https://res.cloudinary.com/rodryv2e/image/upload/v1789106937/desktop_b6wayg.webp',
  }
};
window.CONFIG = CONFIG;
