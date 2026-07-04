/* ═══════════════════════════════════════════════════════
   DATA LOADING
═══════════════════════════════════════════════════════ */
function showBanner(msg, bg, color) {
  const b = document.getElementById('infoBanner');
  b.textContent = msg;
  Object.assign(b.style, { background: bg, color, borderBottom: `1px solid ${color}44`, display: 'block' });
}

function demoProducts() {
  return [
    { nama:'Kaos Sablon DTF Full Color',   kategori:'Kaos',   deskripsi:'Direct to Film, warna tajam & detail tinggi',       harga:'75000', satuan:'/pcs', gambar:'', badge:'Best Seller',  harga_nama:'', harga_angka:'', harga_nama_angka:'' },
    { nama:'Kaos Sablon Manual 1 Warna',   kategori:'Kaos',   deskripsi:'Sablon manual rubber/plastisol, tahan lama',        harga:'55000', satuan:'/pcs', gambar:'', badge:'',             harga_nama:'', harga_angka:'', harga_nama_angka:'' },
    { nama:'Polo Shirt Sablon Dada',       kategori:'Kaos',   deskripsi:'Bahan pique, sablon dada kiri/kanan',               harga:'90000', satuan:'/pcs', gambar:'', badge:'',             harga_nama:'', harga_angka:'', harga_nama_angka:'' },
    { nama:'Jersey Sablon Sublimasi',      kategori:'Jersey', deskripsi:'Full body print, warna presisi — bahan dari customer', harga:'45000', satuan:'/pcs', gambar:'', badge:'Jasa Sablon', harga_nama:'5000', harga_angka:'3000', harga_nama_angka:'7000' }
  ];
}

async function loadProducts() {
  try {
    // Langsung tembak ke backend Google Apps Script lo
    const res = await fetch(CONFIG.apiUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    const json = await res.json();
    
    // Pastikan data berhasil ditarik dan tidak kosong
    if (json.status === "success" && json.data.length > 0) {
      allProducts = json.data;
      buildFilters();
      filterAndRender();
    } else {
      throw new Error('Database kosong atau format tidak sesuai.');
    }
  } catch(err) {
    // Kalau API error, baru kita tampilkan data demo sebagai cadangan
    allProducts = demoProducts();
    buildFilters();
    filterAndRender();
    showBanner('⚠️ Gagal memuat API: ' + err.message + ' — menampilkan data demo.', '#fef2f2', '#991b1b');
  }
}
