-- TULEHU INKLINE - 009_bulk_order_permissions
-- Additive privilege repair for bulk tables created by migration 008.
-- The Vercel API uses SUPABASE_SERVICE_ROLE_KEY, so this role must have table access.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.bulk_orders to service_role;
grant select, insert, update, delete on table public.bulk_order_items to service_role;
grant select, insert, update, delete on table public.bulk_order_payments to service_role;

-- Verification: all three rows should show the listed privileges for service_role.
-- select table_name, privilege_type
-- from information_schema.role_table_grants
-- where grantee = 'service_role'
--   and table_schema = 'public'
--   and table_name in ('bulk_orders', 'bulk_order_items', 'bulk_order_payments')
-- order by table_name, privilege_type;
