-- READ-ONLY: inspect existing database before considering the audited MCP SQL draft.
-- Returns only schema/role metadata, not customer records or credentials.
select current_database() as database_name, current_user as execution_role,
       current_setting('server_version') as postgres_version;

select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled,
       has_table_privilege('service_role', c.oid, 'SELECT') as service_can_select,
       has_table_privilege('service_role', c.oid, 'UPDATE') as service_can_update,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_has_select_grant,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_has_select_grant
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p')
  and c.relname in ('orders','bulk_orders','bulk_order_items','order_payments','bulk_order_payments','finance_transactions','accounts','products','mcp_status_receipts')
order by c.relname;

select table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and (
  (table_name in ('orders','bulk_orders') and column_name in ('id','status','total','nominal_dibayar','sisa','status_bayar')) or
  (table_name='finance_transactions' and column_name in ('id_pesanan','bulk_order_id'))
)
order by table_name,column_name;

select rolname,rolbypassrls from pg_catalog.pg_roles
where rolname in ('anon','authenticated','service_role')
order by rolname;

select to_regprocedure('public.mcp_set_order_status_audited(uuid,text,text,uuid,text,text)') as audited_rpc,
       to_regclass('public.mcp_status_receipts') as receipt_table;
