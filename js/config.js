/* ═══════════════════════════════════════════════════════
   KONFIGURASI — edit sesuai kebutuhan
═══════════════════════════════════════════════════════ */
const CONFIG = {
  // Ganti dengan URL Web App dari Google Apps Script lo
  apiUrl: 'https://script.google.com/macros/s/AKfycbzlYlpJpNKOOUki_TQ0gs9McSgDGFSw7n_H1RWPc-OX3biRoEajOl1bpBAW0i-bsKV2/exec',

  waNumber: '628218025886',
  waDefaultMsg: 'Halo Tulehu Inkline! Saya mau tanya tentang produk sablon.',

  // Surcharge kaos (Rp)
  surcharge: {
    lenganPanjang: 10000,
    xxl: 10000,
    xxxl: 20000,
  },

  kaos: {
    sizes:   ['S','M','L','XL','XXL','3XL'],
    sleeves: ['Lengan Pendek','Lengan Panjang'],
    colors:  ['Putih','Hitam','Abu-abu','Navy','Maroon','Kuning','Hijau Botol','Baby Blue','Krem','Merah'],
  },

  jersey: {
    nameSets: ['Nama saja','Angka saja','Nama + Angka'],
  }
};
