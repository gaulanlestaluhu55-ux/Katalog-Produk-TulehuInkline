// Cek token admin dari header "Authorization: Bearer <token>"
export function getToken(req) {
  const header = req.headers['authorization'] || req.headers['Authorization'];
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  // fallback: boleh juga dikirim lewat query ?token=xxx (buat kemudahan GET dari browser)
  if (req.query && req.query.token) return req.query.token;
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

// CORS: izinkan dipanggil dari GitHub Pages (dan localhost buat dev)
export function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Panggil di awal tiap handler. Return true kalau ini preflight OPTIONS (sudah di-handle, stop lanjut).
export function handleCors(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
