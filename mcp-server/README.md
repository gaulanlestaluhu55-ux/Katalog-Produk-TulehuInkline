# Tulehu Inkline MCP — v0.2.1

Private, single-owner Streamable HTTP MCP. Separate Vercel project, root `mcp-server/`, Node 22. Uses existing Tulehu Inkline API instead of direct Supabase access or duplicated domain calculations. An additive audited PATCH action supports status changes and gated v0.2 operations. Existing v0.1 status-write production deployment remains compatible. New SQL must be validated before activation.

## Environment (configure directly in Vercel)
- MCP_API_KEY: independently generated random secret, at least 32 characters
- MCP_OWNER_ID: owner identifier
- MCP_API_SCOPES: mcp:read (add mcp:write only after testing)
- MCP_ENABLE_STATUS_WRITE: false by default; true only after deploying and validating backend PATCH action
- INKLINE_BACKEND_ADMIN_TOKEN: existing backend admin credential; server-only, never return or log
- MCP_ALLOW_QUERY_KEY: false by default; true only if required by private connector compatibility. Prefer Bearer; URL keys can leak into logs.

## Verification
```sh
npm install
npm run check
npm test
```
Review dependency resolution and commit lockfile before deployment. Runtime verification requires SDK install and staging endpoint. Verify initialize, tools/list, tools/call, unauthorized requests, origin rejection, and compare read results with dashboard. Existing API list limits may truncate results; do not treat missing results as proof of absence.

v0.2 default inventory: 28 read tools. With both status-write scope and feature flag: 30 tools, including update_order_status and update_bulk_order_status. Both require ID, expectedStatus and target status. No cancellation or reopening delivered orders. Deploy reviewed audit SQL and backend PATCH first; old backend returns 405 for the audited action. Compare-and-set guards against stale status, not full order revision (ABA remains possible). Durable audit logging is implemented as an unapplied SQL draft; do not enable production write until approved and tested. Financial write release requires atomicity, account validation, idempotency, audit and authorization. Do not deploy until repository target is confirmed and diff reviewed.

New read tools: get_business_rules (current bulk pricing contract), get_outstanding_payments (non-cancelled sisa > 0), get_production_queue (active stock statuses), preview_bulk_order (active product, existing pricing builder, no persistence). Backend GET ?action=mcp-rules and PATCH ?action=mcp-preview must be deployed before using the two new pricing tools. PATCH preview is intentionally non-mutating; old backend returns 405. Combined reports cover only records returned by existing APIs, not a guaranteed complete ledger.

### Audited status write (draft SQL required)
Backend environment: MCP_AUDIT_OWNER_ID (single authenticated owner ID, same identifier as MCP_OWNER_ID). Apply reviewed SQL draft to a separate test DB first; do not apply to production yet. Status tools now use PATCH ?action=mcp-status-audited, require requestId UUID, and fail closed if RPC is absent. No unaudited fallback. Same requestId+same input replays original receipt, not current state; different input is rejected. Receipt is append-only for service_role, with RLS enabled and explicit grants. Production write stays disabled until real SQL rollback/replay/permission tests and deployment verification.

Database validation order (manual, separate staging database with existing schema): run `backend/sql/preflight_mcp_status_audit.sql` (read-only), review/apply `draft_mcp_status_audit.sql` in staging, then run `test_draft_mcp_status_audit.sql` as staging SQL editor owner. The test switches to service_role, injects a receipt constraint failure, verifies rollback and historical replay, then rolls back all fixtures and the temporary constraint. Separate two-session concurrency test is still required. Never run staging test on production. No DB migration has been applied by the agent.

## v0.2 complete tool inventory — candidate (49)
- 28 read/preview tools: prior 21 plus search_orders, search_bulk_orders, search_products, get_vendor, get_account_balances, get_sales_summary, get_finance_report.
- 2 existing status-write tools.
- 8 new ordinary writes: create_order, update_order, create_bulk_order, create_product, update_product, set_product_status, create_vendor, update_vendor.
- 10 high-impact ledger/order writes: add_order_payment, void_order_payment, cancel_order, add_bulk_order_payment, void_bulk_order_payment, cancel_bulk_order, create_income, create_expense, transfer_funds, void_transfer.
- 1 media upload: upload_product_image; returns a URL, does not automatically edit product.

## New gated configuration
Existing environments remain. For v0.2 operations add MCP_ENABLE_OPERATIONS=true on both backend and MCP projects only after SQL verification. For financial writes add MCP_ENABLE_FINANCE_WRITE=true on both projects and add mcp:high-impact to MCP_API_SCOPES (mcp:read,mcp:write,mcp:high-impact). Media requires MCP_ENABLE_MEDIA_WRITE=true on both; backend requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET and MCP_MEDIA_ALLOWED_HOSTS (comma-separated exact trusted attachment-download hosts, no wildcards; determine actual host from an approved attachment, never disclose signed URLs). Existing credentials remain server-side. Media uses a deterministic request-ID public ID and overwrite=false, bounded 8 MiB PNG/JPEG/WebP download; no automatic attachment, no transactional DB receipt for external upload, check asset before retry if uncertain.

## v0.2 rollout
1. Local npm run check and npm test; expected 44 tests. npm version 0.2.0 --no-git-tag-version --allow-same-version updates package and lockfile (no dependency change).
2. Review/apply backend/sql/draft_mcp_operations_v2.sql on separate staging DB; execute test_draft_mcp_operations_v2.sql there. Test covers 18 DB operations, same-ID replay/conflict, balanced ledger, forced receipt failure and full rollback. This is not yet an executed integration result.
3. After staging passes, apply only draft on production, commit explicit v0.2 paths and deploy backend/MCP. Enable new feature flags only after verification. Refresh connector, compare discovery count 28/30/38/48/49 by scopes and flags.
4. Test real operations only with explicit owner instructions. No initial payment on create_order/create_bulk_order; separate payment tool. Bulk create requires preview and expected total; regular create requires explicitly agreed unit price. Financial writes require expected paid snapshot, existing account for new payments and consistent ledger history; canceled orders excluded from payments. No actual bank money movement. Legacy dashboard regular-payment/transfer endpoints remain non-atomic and do not share all MCP locking; do not concurrently write same order or transfer from dashboard and MCP. New SQL transaction covers MCP operations only. Request IDs are per operation, same ID+same input for retry; receipt hash excludes raw customer payload. No hard-delete tool. Account balances and reports limited to records returned by existing APIs; sales range is WIT (UTC+9). SQL concurrency and Cloudinary live upload remain unverified.
## v0.2.1 patch
- Backend bulk validator merges identical normalized size/color/sleeve rows for both preview and audited create. First-seen order retained; merged variant qty <= 10000. Raw create request hash unchanged; retry exact original input and ID.
- Known backend validation codes map to fixed MCP messages; raw error/DB text never forwarded.
- read-all.js fetches count:'exact' pages, stable unique-key tie-breaker, verifies counts and unique keys, handles server cap lower than requested page, rejects gaps/changed count/missing count/duplicate keys and >50000 rows. Applied to orders, bulk orders/items/payments, finance, accounts, vendors, products/sold counts, dashboard aggregates and stock reads. Dashboard recent-orders remains intentionally limited. New MCP read service requires X-Inkline-Read-Contract:paged-v1 for data reads; rules/preview exempt. Deploy backend BEFORE MCP, otherwise new MCP rejects unverified data. Count checks are not snapshot isolation across pages/queries: same-count concurrent changes may still affect results. Runtime size/time limits still apply. No SQL/ENV changes.
- Expected 51 local tests (44 previous + 7 patch regressions); user runs npm version 0.2.1 --no-git-tag-version --allow-same-version, npm run check and npm test. Live backend verification still required; write operations and Cloudinary unchanged, not exercised.
