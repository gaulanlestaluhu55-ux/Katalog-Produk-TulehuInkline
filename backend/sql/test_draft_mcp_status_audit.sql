-- STAGING ONLY: run after draft_mcp_status_audit.sql on a separate test database.
-- Synthetic orders are rolled back at the end. Do not run on production.
begin;
-- Install a deliberately failing receipt constraint only inside this test transaction.
-- The final ROLLBACK removes it. Run as the staging SQL editor owner.
alter table public.mcp_status_receipts
  add constraint mcp_test_forced_receipt_failure
  check (actor_id <> 'test-owner-force-rollback') not valid;

-- Exercise the same privileges as PostgREST's backend service role, not the SQL editor owner.
set local role service_role;
do $
declare
  v_id uuid := gen_random_uuid();
  v_bulk uuid := gen_random_uuid();
  v_req uuid := gen_random_uuid();
  v_result jsonb;
  v_fail_req uuid := gen_random_uuid();
  v_failed boolean := false;
  v_count integer;
begin
  if current_user <> 'service_role' then raise exception 'Wrong execution role'; end if;
  insert into public.orders(id,nama_customer,nama_produk,status,nominal_dibayar,total,sisa)
  values(v_id,'MCP TEST','TEST','Baru',10000,50000,40000);
  insert into public.bulk_orders(id,nama_customer,nama_produk,status,nominal_dibayar,total,sisa)
  values(v_bulk,'MCP TEST','TEST','Siap Produksi',10000,50000,40000);
  v_result:=public.mcp_set_order_status_audited(v_req,'test-owner','regular',v_id,'Baru','Diproses');
  if v_result->>'ok' is distinct from 'true' or v_result->>'changed' is distinct from 'true' then raise exception 'Initial update failed'; end if;
  v_result:=public.mcp_set_order_status_audited(v_req,'test-owner','regular',v_id,'Baru','Diproses');
  if v_result->>'replayed' is distinct from 'true' then raise exception 'Replay failed'; end if;
  select count(*) into v_count from public.mcp_status_receipts where request_id=v_req;
  if v_count<>1 then raise exception 'Duplicate receipt'; end if;
  v_result:=public.mcp_set_order_status_audited(v_req,'test-owner','regular',v_id,'Baru','Selesai');
  if v_result->>'code' is distinct from 'IDEMPOTENCY_CONFLICT' then raise exception 'Changed payload accepted'; end if;
  v_result:=public.mcp_set_order_status_audited(gen_random_uuid(),'test-owner','regular',v_id,'Baru','Selesai');
  if v_result->>'code' is distinct from 'STATUS_CONFLICT' then raise exception 'Stale status accepted'; end if;
  v_result:=public.mcp_set_order_status_audited(gen_random_uuid(),'test-owner','regular',v_id,'Diproses','Batal');
  if v_result->>'code' is distinct from 'INVALID_INPUT' then raise exception 'Cancellation accepted'; end if;
  v_result:=public.mcp_set_order_status_audited(gen_random_uuid(),'test-owner','bulk',v_bulk,'Siap Produksi','Selesai Produksi');
  if v_result->>'ok' is distinct from 'true' then raise exception 'Bulk update failed'; end if;
  if not exists(select 1 from public.orders where id=v_id and status='Diproses' and nominal_dibayar=10000 and sisa=40000)
     or not exists(select 1 from public.bulk_orders where id=v_bulk and status='Selesai Produksi' and nominal_dibayar=10000 and sisa=40000) then raise exception 'Unexpected status or payment mutation'; end if;
  -- Inject an audit INSERT failure after the order UPDATE. A PL/pgSQL exception
  -- block rolls back the failed function call; the original order must survive.
  begin
    perform public.mcp_set_order_status_audited(v_fail_req,'test-owner-force-rollback','regular',v_id,'Diproses','Selesai');
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'Expected receipt failure did not occur'; end if;
  if not exists(select 1 from public.orders where id=v_id and status='Diproses') then raise exception 'Status was not rolled back with receipt failure'; end if;
  if exists(select 1 from public.mcp_status_receipts where request_id=v_fail_req) then raise exception 'Failed receipt unexpectedly persisted'; end if;

  -- Replaying the successful old request after a later change must not overwrite it.
  v_result:=public.mcp_set_order_status_audited(gen_random_uuid(),'test-owner','regular',v_id,'Diproses','Selesai');
  if v_result->>'ok' is distinct from 'true' then raise exception 'Later update failed'; end if;
  v_result:=public.mcp_set_order_status_audited(v_req,'test-owner','regular',v_id,'Baru','Diproses');
  if v_result->>'replayed' is distinct from 'true' or v_result->>'status' is distinct from 'Diproses'
     or not exists(select 1 from public.orders where id=v_id and status='Selesai') then raise exception 'Historical replay overwrote current order'; end if;
  if exists(select 1 from public.finance_transactions where id_pesanan=v_id or bulk_order_id=v_bulk) then raise exception 'Unexpected finance transaction'; end if;
  if has_table_privilege('anon','public.mcp_status_receipts','SELECT') or has_table_privilege('authenticated','public.mcp_status_receipts','SELECT')
     or has_table_privilege('service_role','public.mcp_status_receipts','UPDATE') or has_table_privilege('service_role','public.mcp_status_receipts','DELETE')
     or has_function_privilege('anon','public.mcp_set_order_status_audited(uuid,text,text,uuid,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.mcp_set_order_status_audited(uuid,text,text,uuid,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.mcp_set_order_status_audited(uuid,text,text,uuid,text,text)','EXECUTE') then raise exception 'Unexpected grants'; end if;
  raise notice 'MCP status audit smoke checks PASS; rolling back synthetic data.';
end $;
reset role;
rollback;
-- A successful execution reports the PASS notice above; all fixtures/constraint are rolled back.
