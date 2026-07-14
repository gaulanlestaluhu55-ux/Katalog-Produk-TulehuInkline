/* ═══════════════════════════════════════════════════════
   ADMIN CORE — shared across all admin pages (login, auth, toast, sw)
═══════════════════════════════════════════════════════ */

window.adminToken = localStorage.getItem('adminToken') || '';

window.authHeaders = function(json) {
  const h = { Authorization: `Bearer ${window.adminToken}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

window.showStatus = function(msg, ok) {
  const el = document.getElementById('statusMsg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-msg show ' + (ok ? 'ok' : 'err');
  setTimeout(() => el.classList.remove('show'), 3500);
};

window.apiFetch = async function(url, options) {
  if (!options) options = {};
  if (!options.headers) options.headers = window.authHeaders(options.body);
  try {
    const res = await fetch(url, options);
    return res;
  } catch (err) {
    // Retry once after 1s
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err2) {
      window.showOffline(true);
      throw err2;
    }
  }
};

window.showOffline = function(offline) {
  let bar = document.getElementById('offlineBar');
  if (offline) {
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'offlineBar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;background:var(--err-text,#991b1b);color:#fff;text-align:center;padding:8px 12px;font-size:13px;font-weight:600;';
      bar.textContent = 'Koneksi terputus. Coba lagi...';
      document.body.prepend(bar);
    }
    bar.style.display = 'block';
  } else if (bar) {
    bar.style.display = 'none';
  }
};

window.addEventListener('online', () => window.showOffline(false));
window.addEventListener('offline', () => window.showOffline(true));

window.registerSW = function() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
};

window.logout = function() {
  localStorage.removeItem('adminToken');
  window.adminToken = '';
  const adminApp = document.getElementById('adminApp');
  const loginScreen = document.getElementById('loginScreen');
  if (adminApp) adminApp.style.display = 'none';
  if (loginScreen) loginScreen.style.display = 'flex';
  const tokenInput = document.getElementById('tokenInput');
  if (tokenInput) tokenInput.value = '';
};

window.initLogin = function(loginCallback) {
  const loginScreen = document.getElementById('loginScreen');
  const adminApp = document.getElementById('adminApp');
  const loginError = document.getElementById('loginError');
  const tokenInput = document.getElementById('tokenInput');
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  async function tryLogin(token) {
    window.adminToken = token;
    try {
      await loginCallback(token);
      localStorage.setItem('adminToken', token);
      loginScreen.style.display = 'none';
      adminApp.style.display = 'block';
    } catch (err) {
      window.adminToken = '';
      localStorage.removeItem('adminToken');
      if (loginError) loginError.style.display = 'block';
    }
  }

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', e => {
      e.preventDefault();
      const val = tokenInput.value.trim();
      if (val) tryLogin(val);
    });
  } else if (loginBtn && tokenInput) {
    loginBtn.addEventListener('click', () => {
      const val = tokenInput.value.trim();
      if (val) tryLogin(val);
    });
  }
  if (logoutBtn) logoutBtn.addEventListener('click', window.logout);

  if (window.adminToken) {
    return tryLogin(window.adminToken);
  }
};

window.requireAuth = async function(callback) {
  const adminApp = document.getElementById('adminApp');
  const logoutBtn = document.getElementById('logoutBtn');
  if (!window.adminToken) { window.location.href = 'admin.html'; return; }

  try {
    const verifyRes = await window.apiFetch(`${CONFIG.apiUrl}/api/accounts`, { headers: window.authHeaders() });
    const verifyJson = await verifyRes.json();
    if (verifyJson.status !== 'success') throw new Error(verifyJson.message || 'Unauthorized');
  } catch (err) {
    window.adminToken = '';
    localStorage.removeItem('adminToken');
    window.location.href = 'admin.html';
    return;
  }

  try {
    await callback(window.adminToken);
    if (adminApp) adminApp.style.display = 'block';
  } catch (err) {
    if (adminApp) adminApp.style.display = 'block';
    window.showStatus(err.message || 'Gagal memuat halaman.', false);
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      window.logout();
      window.location.href = 'admin.html';
    });
  }
};
