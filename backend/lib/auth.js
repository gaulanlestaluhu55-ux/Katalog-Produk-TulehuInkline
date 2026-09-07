// Cek token admin dari header "Authorization: Bearer <token>"
export function getToken(req) {
  const header = req.headers['authorization'] || req.headers['Authorization'];
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

export function isAdmin(req) {
  const token = getToken(req);
  return !!(token && token === process.env.ADMIN_TOKEN);
}

export function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    res.status(401).json({ status: 'error', message: 'Unauthorized' });
    return false;
  }
  return true;
}

// CORS: allowlist multi-origin via koma, misal:
// CORS_ORIGIN=https://katalog.tulehuinkline.my.id,http://localhost:8000
// Origin request yang terdaftar di-echo balik; yang tidak terdaftar
// dapat fallback origin pertama (produksi) sehingga tetap ditolak browser.
export function setCors(req, res) {
  const raw = process.env.CORS_ORIGIN || 'https://katalog.tulehuinkline.my.id';
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers['origin'] || req.headers['Origin'] || '';
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : allowed[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Panggil di awal tiap handler. Return true kalau ini preflight OPTIONS (sudah di-handle, stop lanjut).
export function handleCors(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
