## Objective
- Optimize and expand the admin application: fix security issues, eliminate CSS/JS duplication, upgrade service worker, add financial dashboard with category tracking, all without a build tool.

## Important Details
- Frontend on GitHub Pages, backend on Vercel (solo dev, Supabase free tier).
- User chose Opsi A (no build tool): shared CSS → `css/admin.css`, shared JS → `js/admin-core.js`.
- Vercel Hobby plan limits Serverless Functions to 12. Merged 4 dashboard files → 1 (`?type=` param), merged stock/status → stock/index (`?action=` param). Current count: 12 files.
- Login flow: only `admin.html` has login form (`initLogin`), sub-pages use `requireAuth` which redirects to `admin.html` if no token in `localStorage`.
- Kategori feature: dropdown per jenis (Masuk/Keluar) in keuangan.html, rekap per kategori table, dashboard financial section (KPI, pie chart, bar chart, modal detail).
- Laporan Keuangan page (`laporan-keuangan.html`): standalone financial report page with KPI, doughnut chart, bar chart, full kategori rekap table, full transaction table, range filter (1d/1m/12m), clickable kategori → transaction modal. Accessible from top nav on all admin pages.
- New backend endpoint: `GET /api/dashboard?type=finance&range=` — aggregates `finance_transactions` by kategori and month, returns 50 latest transactions.
- SW current cache version is `tulehu-v9`.

## Work State
### Completed
- Phase 0 (Security): removed `?token=` query param fallback, CORS uses `process.env.CORS_ORIGIN`.
- Phase 1 (DRY): extracted shared CSS → `css/admin.css`, shared JS → `js/admin-core.js`, unified config → `js/config.js`, consolidated helpers → `js/helpers.js`.
- Phase 2.1: upgraded `sw.js` with cache-first for static assets, network-first for HTML, network-only for API, offline indicator.
- Phase 2.2: added `window.apiFetch()` (auto-retry on network error), `window.showOffline()` (offline bar), `window.requireAuth()` (redirect sub-pages to admin.html when token missing).
- Phase 2.3: cancelled.
- Vercel Hobby 12-function limit: merged 4 dashboard files → 1 (`backend/api/dashboard/index.js?type=`), merged `stock/status.js` → `stock/index.js?action=status`. Total: 12 functions.
- Login refactor: login only on `admin.html`, sub-pages use `requireAuth` (redirect to admin.html if no valid token).
- Form fix: wrapped password inputs in `<form id="loginForm">`, login button `type="submit"`, `initLogin` uses form submit event instead of click+keydown.
- Kategori feature: dropdown per jenis (Masuk/Keluar) in keuangan.html, rekap per kategori table, dashboard financial section.
- Laporan Keuangan page (`laporan-keuangan.html`): standalone full report with charts, kategori rekap table, full transaction table, range filter, clickable kategori → modal.

### Active
- (none)

### Blocked
- (none)

## Next Move
- Deploy to GitHub Pages + Vercel.

## Relevant Files
- `laporan-keuangan.html` — Standalone financial report page.
- `js/config.js` — CONFIG object with apiUrl, categories, kaos/jersey options.
- `js/admin-core.js` — Shared auth, apiFetch, initLogin, requireAuth, logout, showOffline, registerSW.
- `css/admin.css` — All shared admin styles (~648 lines).
- `js/helpers.js` — fmt, toNum, isJersey, getNameSetPrice.
- `backend/api/dashboard/index.js` — Merged dashboard endpoints: summary, monthly, top-products, recent-orders, finance (via `?type=`).
- `backend/api/stock/index.js` — Merged stock: GET list + POST `?action=status`.
- `backend/lib/auth.js` — Token from Authorization header, CORS from env var.
- `sw.js` — SW v9, cache-first for static, network-first for HTML.
- `admin.html` — Login form, product CRUD, initLogin.
- `keuangan.html` — Transaction CRUD, kategori dropdown, rekap per kategori table.
- `dashboard.html` — KPI, charts, finance section, "Lihat Laporan Lengkap" link.
- `pesanan.html`, `stok.html`, `vendor.html` — Sub-pages using requireAuth.
