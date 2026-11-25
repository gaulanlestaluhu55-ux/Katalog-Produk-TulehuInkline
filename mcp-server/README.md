# Tulehu Inkline MCP — M1/M2 candidate

Private, single-owner Streamable HTTP MCP. Separate Vercel project, root `mcp-server/`, Node 22. Uses existing Tulehu Inkline API instead of direct Supabase access or duplicated domain calculations. An additive audited PATCH action supports opt-in production status changes; reviewed SQL deployment is required for writes. No financial writes.

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

Default inventory: 21 read tools. With both write scope and feature flag: 23 tools, including update_order_status and update_bulk_order_status. Both require ID, expectedStatus and target status. No cancellation or reopening delivered orders. Deploy reviewed audit SQL and backend PATCH first; old backend returns 405 for the audited action. Compare-and-set guards against stale status, not full order revision (ABA remains possible). Durable audit logging is implemented as an unapplied SQL draft; do not enable production write until approved and tested. Financial write release requires atomicity, account validation, idempotency, audit and authorization. Do not deploy until repository target is confirmed and diff reviewed.

New read tools: get_business_rules (current bulk pricing contract), get_outstanding_payments (non-cancelled sisa > 0), get_production_queue (active stock statuses), preview_bulk_order (active product, existing pricing builder, no persistence). Backend GET ?action=mcp-rules and PATCH ?action=mcp-preview must be deployed before using the two new pricing tools. PATCH preview is intentionally non-mutating; old backend returns 405. Combined reports cover only records returned by existing APIs, not a guaranteed complete ledger.

### Audited status write (draft SQL required)
Backend environment: MCP_AUDIT_OWNER_ID (single authenticated owner ID, same identifier as MCP_OWNER_ID). Apply reviewed SQL draft to a separate test DB first; do not apply to production yet. Status tools now use PATCH ?action=mcp-status-audited, require requestId UUID, and fail closed if RPC is absent. No unaudited fallback. Same requestId+same input replays original receipt, not current state; different input is rejected. Receipt is append-only for service_role, with RLS enabled and explicit grants. Production write stays disabled until real SQL rollback/replay/permission tests and deployment verification.

Database validation order (manual, separate staging database with existing schema): run `backend/sql/preflight_mcp_status_audit.sql` (read-only), review/apply `draft_mcp_status_audit.sql` in staging, then run `test_draft_mcp_status_audit.sql` as staging SQL editor owner. The test switches to service_role, injects a receipt constraint failure, verifies rollback and historical replay, then rolls back all fixtures and the temporary constraint. Separate two-session concurrency test is still required. Never run staging test on production. No DB migration has been applied by the agent.
