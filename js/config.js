/* ═══════════════════════════════════════════════════════
   KONFIGURASI — edit sesuai kebutuhan
═══════════════════════════════════════════════════════ */
const CONFIG = {
  // Ganti "https://xxxxx.vercel.app" sesuai URL project Vercel lo (tanpa trailing slash)
  apiUrl: 'https://katalog-produk-tulehu-inkline.vercel.app',

  waNumber: '628218025886',
  waDefaultMsg: 'Halo Tulehu Inkline! Saya mau tanya tentang produk sablon.',

  // Surcharge kaos (Rp)
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
  }
};
