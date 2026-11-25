-- STAGING ONLY. Requires existing schema and draft_mcp_operations_v2.sql.
-- Synthetic data and all receipts rolled back. Runs all 18 DB operations.
begin;
alter table public.mcp_operation_receipts add constraint mcp_test_operation_receipt_failure check (actor_id <> 'mcp-test-force-failure') not valid;
set local role service_role;
do $mcp_all$
declare
 r jsonb;
 req uuid;
 product_id uuid;
 vendor_id uuid;
 regular_id uuid;
 bulk_id uuid;
 payment_id uuid;
 bulk_payment_id uuid;
 transfer_id_test uuid;
 account_a text:='MCP_TEST_A_'||gen_random_uuid()::text;
 account_b text:='MCP_TEST_B_'||gen_random_uuid()::text;
 hash text:=repeat('a',64);
 balance_a numeric;
 balance_b numeric;
 failed boolean:=false;
begin
 if current_user<>'service_role' then raise exception 'Unexpected test role'; end if;
 insert into public.accounts(nama) values(account_a),(account_b);
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','create_product',hash,jsonb_build_object('nama','MCP TEST','kategori','Kaos','harga',100000,'sizes','L','colors','Hitam'));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'create_product failed: %',r; end if;
 product_id:=(r->>'id')::uuid;
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','create_product',hash,jsonb_build_object('nama','MCP TEST','kategori','Kaos','harga',100000,'sizes','L','colors','Hitam'));
 if r->>'replayed' is distinct from 'true' or (r->>'id')::uuid is distinct from product_id then raise exception 'Replay failed'; end if;
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','create_product',repeat('b',64),jsonb_build_object('nama','MCP TEST','kategori','Kaos','harga',100000,'sizes','L','colors','Hitam'));
 if r->>'code' is distinct from 'IDEMPOTENCY_CONFLICT' then raise exception 'Conflict check failed'; end if;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','update_product',hash,jsonb_build_object('id',product_id,'badge','TEST','pinned',true));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'update_product failed: %',r; end if;

 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','create_vendor',hash,jsonb_build_object('nama','MCP TEST VENDOR'));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'create_vendor failed: %',r; end if;
 vendor_id:=(r->>'id')::uuid;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','update_vendor',hash,jsonb_build_object('id',vendor_id,'catatan','updated'));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'update_vendor failed: %',r; end if;

 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','create_order',hash,jsonb_build_object('id_produk',product_id,'nama_produk','MCP TEST','kategori','Kaos','nama_customer','MCP TEST','size','L','warna','Hitam','lengan','Lengan Pendek','qty',2,'harga_satuan',100000));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'create_order failed: %',r; end if;
 regular_id:=(r->>'id')::uuid; if (r->>'total')::numeric<>200000 then raise exception 'Regular price mismatch'; end if;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','update_order',hash,jsonb_build_object('id',regular_id,'expectedTotal',200000,'expectedPaid',0,'qty',3));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'update_order failed: %',r; end if;
 if (r->>'total')::numeric<>300000 then raise exception 'Edit price mismatch'; end if;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','add_order_payment',hash,jsonb_build_object('id',regular_id,'expectedPaid',0,'nominal',100000,'akun',account_a));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'add_order_payment failed: %',r; end if;
 payment_id:=(r->>'paymentId')::uuid; if (r->>'nominal_dibayar')::numeric<>100000 then raise exception 'Regular payment mismatch'; end if;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','void_order_payment',hash,jsonb_build_object('id',regular_id,'expectedPaid',100000,'paymentId',payment_id));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'void_order_payment failed: %',r; end if;
 if (r->>'nominal_dibayar')::numeric<>0 then raise exception 'Regular void mismatch'; end if;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','add_order_payment',hash,jsonb_build_object('id',regular_id,'expectedPaid',0,'nominal',50000,'akun',account_a));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'add_order_payment failed: %',r; end if;

 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','cancel_order',hash,jsonb_build_object('id',regular_id,'expectedStatus','Baru','expectedPaid',50000));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'cancel_order failed: %',r; end if;
 if r->>'status'<>'Batal' or (r->>'nominal_dibayar')::numeric<>0 then raise exception 'Regular cancel mismatch'; end if;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','create_bulk_order',hash,jsonb_build_object('id_produk',product_id,'nama_produk','MCP TEST','kategori','Kaos','nama_customer','MCP TEST','cuttingan','Reguler','status','Menunggu DP','nominal_dibayar',0,'catalog_price',100000,'catalog_sizes','L','catalog_colors','Hitam','expectedTotal',200000,'items',jsonb_build_array(jsonb_build_object('id_produk',product_id,'nama_produk','MCP TEST','kategori','Kaos','size','L','warna','Hitam','lengan','Lengan Pendek','cuttingan','Reguler','qty',2,'harga_satuan_normal',100000,'harga_satuan_final',100000,'discount_type','nominal','discount_value',0,'discount_per_unit',0,'subtotal',200000,'total_discount',0,'total',200000))));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'create_bulk_order failed: %',r; end if;
 bulk_id:=(r->>'id')::uuid; if (r->>'total')::numeric<>200000 then raise exception 'Bulk price mismatch'; end if;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','add_bulk_order_payment',hash,jsonb_build_object('id',bulk_id,'expectedPaid',0,'nominal',50000,'akun',account_a));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'add_bulk_order_payment failed: %',r; end if;
 select id into bulk_payment_id from public.bulk_order_payments where bulk_order_id=bulk_id and nominal=50000; if bulk_payment_id is null then raise exception 'Bulk payment missing'; end if;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','void_bulk_order_payment',hash,jsonb_build_object('id',bulk_id,'expectedPaid',50000,'paymentId',bulk_payment_id));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'void_bulk_order_payment failed: %',r; end if;
 if (r->>'nominal_dibayar')::numeric<>0 then raise exception 'Bulk void mismatch'; end if;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','add_bulk_order_payment',hash,jsonb_build_object('id',bulk_id,'expectedPaid',0,'nominal',50000,'akun',account_a));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'add_bulk_order_payment failed: %',r; end if;

 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','cancel_bulk_order',hash,jsonb_build_object('id',bulk_id,'expectedStatus','Menunggu DP','expectedPaid',50000));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'cancel_bulk_order failed: %',r; end if;
 if r->>'status'<>'Batal' or (r->>'nominal_dibayar')::numeric<>0 then raise exception 'Bulk cancel mismatch'; end if;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','set_product_status',hash,jsonb_build_object('id',product_id,'expectedActive',true,'aktif',false));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'set_product_status failed: %',r; end if;
 if r->>'aktif'<>'false' then raise exception 'Product status mismatch'; end if;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','create_income',hash,jsonb_build_object('akun',account_a,'nominal',100000,'kategori','Modal','keterangan','MCP TEST'));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'create_income failed: %',r; end if;

 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','create_expense',hash,jsonb_build_object('akun',account_a,'nominal',10000,'kategori','Operasional','keterangan','MCP TEST'));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'create_expense failed: %',r; end if;

 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','transfer_funds',hash,jsonb_build_object('akun_sumber',account_a,'akun_tujuan',account_b,'nominal',20000,'tanggal','2026-11-25'));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'transfer_funds failed: %',r; end if;
 transfer_id_test:=(r->>'transfer_id')::uuid;
 req:=gen_random_uuid();
 r:=public.mcp_execute_operation_v2(req,'mcp-test-owner','void_transfer',hash,jsonb_build_object('transferId',transfer_id_test));
 if r->>'ok' is distinct from 'true' or r->>'replayed' is distinct from 'false' then raise exception 'void_transfer failed: %',r; end if;
 if r->>'reversal_id' is null then raise exception 'Transfer reversal missing'; end if;
 select coalesce(sum(case when tipe='Masuk' then nominal else -nominal end),0) into balance_a from public.finance_transactions where akun=account_a;
 select coalesce(sum(case when tipe='Masuk' then nominal else -nominal end),0) into balance_b from public.finance_transactions where akun=account_b;
 if balance_a<>90000 or balance_b<>0 then raise exception 'Ledger net mismatch: %, %',balance_a,balance_b; end if;
 if exists(select 1 from public.order_payments where id_pesanan=regular_id group by id_pesanan having sum(nominal)<>0) or exists(select 1 from public.bulk_order_payments where bulk_order_id=bulk_id group by bulk_order_id having sum(nominal)<>0) then raise exception 'Payment net mismatch'; end if;
 if has_table_privilege('anon','public.mcp_operation_receipts','SELECT') or has_table_privilege('authenticated','public.mcp_operation_receipts','SELECT') or has_table_privilege('service_role','public.mcp_operation_receipts','UPDATE') or has_function_privilege('anon','public.mcp_execute_operation_v2(uuid,text,text,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.mcp_execute_operation_v2(uuid,text,text,text,jsonb)','EXECUTE') then raise exception 'Unexpected grants'; end if;
 begin
  perform public.mcp_execute_operation_v2(gen_random_uuid(),'mcp-test-force-failure','create_vendor',hash,jsonb_build_object('nama','MCP ROLLBACK '||account_a));
 exception when check_violation then failed:=true;
 end;
 if not failed or exists(select 1 from public.vendors where nama='MCP ROLLBACK '||account_a) then raise exception 'Receipt failure did not roll back operation'; end if;
 raise notice 'MCP v0.2 all 18 DB operations PASS; rollback follows.';
end $mcp_all$;
reset role;
rollback;