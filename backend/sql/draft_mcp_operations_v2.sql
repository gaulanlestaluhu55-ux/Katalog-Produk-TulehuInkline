-- MCP v0.2: additive operation receipts and transactional write dispatcher.
-- REVIEW / STAGING FIRST. Requires existing migrations 001-009 and status audit.
begin;
create table if not exists public.mcp_operation_receipts(
 request_id uuid primary key,
 actor_id text not null check(length(actor_id) between 1 and 120),
 operation text not null,
 input_hash text not null check(input_hash ~ '^[0-9a-f]{64}$'),
 outcome jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.mcp_operation_receipts enable row level security;
revoke all on table public.mcp_operation_receipts from public, anon, authenticated, service_role;
grant select,insert on table public.mcp_operation_receipts to service_role;

create or replace function public.mcp_execute_operation_v2(
 p_request_id uuid,p_actor_id text,p_operation text,p_input_hash text,p_data jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $mcp_ops$
#variable_conflict use_variable
declare
 prior public.mcp_operation_receipts%rowtype;
 o public.orders%rowtype;
 b public.bulk_orders%rowtype;
 product public.products%rowtype;
 pay public.order_payments%rowtype;
 bpay public.bulk_order_payments%rowtype;
 tx public.finance_transactions%rowtype;
 r record;
 id uuid;
 transfer_id_new uuid;
 output jsonb;
 paid numeric;
 total numeric;
 unit numeric;
 discount numeric;
 discount_kind text;
 quantity integer;
 account_name text;
 amount numeric;
 label text;
 status_new text;
 payment_type text;
 count_rows integer;
 net numeric;
begin
 if p_request_id is null or p_actor_id is null or length(trim(p_actor_id)) not between 1 and 120
 or p_input_hash is null or p_input_hash !~ '^[0-9a-f]{64}$'
 or jsonb_typeof(p_data) is distinct from 'object' then
  return jsonb_build_object('ok',false,'code','INVALID_INPUT');
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
 select * into prior from public.mcp_operation_receipts where request_id=p_request_id;
 if found then
  if prior.actor_id is distinct from p_actor_id or prior.operation is distinct from p_operation or prior.input_hash is distinct from p_input_hash then
   return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');
  end if;
  return prior.outcome || jsonb_build_object('replayed',true);
 end if;

 if p_operation in ('create_order','create_bulk_order') then
  select * into product from public.products where public.products.id=(p_data->>'id_produk')::uuid for share;
  if not found or product.aktif is distinct from true then raise exception 'Product inactive or missing'; end if;
  if product.nama is distinct from p_data->>'nama_produk' or coalesce(product.kategori,'') is distinct from coalesce(p_data->>'kategori','') then raise exception 'Product changed'; end if;
  if coalesce(trim(p_data->>'nama_customer'),'')='' then raise exception 'Customer required'; end if;
  if p_operation='create_order' then
   unit:=(p_data->>'harga_satuan')::numeric; quantity:=(p_data->>'qty')::integer;
   discount_kind:=coalesce(p_data->>'discount_type','nominal'); discount:=coalesce((p_data->>'discount_value')::numeric,0);
   if unit is null or unit<0 or quantity is null or quantity not between 1 and 10000 or discount<0 or discount_kind not in ('nominal','percent') or (discount_kind='percent' and discount>100) or (discount_kind='nominal' and discount>unit) then raise exception 'Invalid pricing'; end if;
   total:=(unit-case when discount_kind='percent' then unit*discount/100 else discount end)*quantity;
   insert into public.orders(id_produk,nama_produk,kategori,nama_customer,kontak,catatan,size,warna,lengan,cuttingan,opsi,qty,harga_satuan,discount_type,discount_value,total,nominal_dibayar,sisa,status_bayar,status)
   values(product.id,product.nama,coalesce(product.kategori,''),trim(p_data->>'nama_customer'),coalesce(p_data->>'kontak',''),coalesce(p_data->>'catatan',''),p_data->>'size',p_data->>'warna',p_data->>'lengan',coalesce(p_data->>'cuttingan','Reguler'),coalesce(p_data->>'opsi',''),quantity,unit,discount_kind,discount,total,0,total,case when total=0 then 'Lunas' else 'Belum Bayar' end,'Baru') returning public.orders.id into id;
  else
   if coalesce((p_data->>'nominal_dibayar')::numeric,-1)<>0 or p_data->>'status' is distinct from 'Menunggu DP' then raise exception 'Initial payment forbidden'; end if;
   if product.harga is distinct from (p_data->>'catalog_price')::numeric or coalesce(product.sizes,'') is distinct from coalesce(p_data->>'catalog_sizes','') or coalesce(product.colors,'') is distinct from coalesce(p_data->>'catalog_colors','') then raise exception 'Catalog pricing changed'; end if;
   select sum((value->>'total')::numeric) into total from jsonb_array_elements(p_data->'items');
   if total is null or total is distinct from (p_data->>'expectedTotal')::numeric then raise exception 'Preview total changed'; end if;
   id:=public.create_bulk_order(p_data);
  end if;
  output:=jsonb_build_object('id',id,'total',total,'nominal_dibayar',0,'sisa',total);

 elsif p_operation='update_order' then
  select * into o from public.orders where public.orders.id=(p_data->>'id')::uuid for update;
  if not found or o.status not in ('Baru','Diproses','Selesai') then raise exception 'Order not editable'; end if;
  if o.total is distinct from (p_data->>'expectedTotal')::numeric or o.nominal_dibayar is distinct from (p_data->>'expectedPaid')::numeric then return jsonb_build_object('ok',false,'code','ORDER_CONFLICT'); end if;
  unit:=coalesce((p_data->>'harga_satuan')::numeric,o.harga_satuan); quantity:=coalesce((p_data->>'qty')::integer,o.qty);
  discount_kind:=coalesce(p_data->>'discount_type',o.discount_type,'nominal'); discount:=coalesce((p_data->>'discount_value')::numeric,o.discount_value,0);
  if unit is null or unit<0 or quantity is null or quantity not between 1 and 10000 or discount<0 or discount_kind not in ('nominal','percent') or (discount_kind='percent' and discount>100) or (discount_kind='nominal' and discount>unit) then raise exception 'Invalid pricing'; end if;
  total:=case when p_data ?| array['harga_satuan','qty','discount_type','discount_value'] then (unit-case when discount_kind='percent' then unit*discount/100 else discount end)*quantity else o.total end;
  paid:=o.nominal_dibayar;
  if paid is null or paid<0 or paid>total then raise exception 'Paid amount exceeds new total'; end if;
  update public.orders set nama_customer=coalesce(p_data->>'nama_customer',o.nama_customer),kontak=coalesce(p_data->>'kontak',o.kontak),catatan=coalesce(p_data->>'catatan',o.catatan),size=coalesce(p_data->>'size',o.size),warna=coalesce(p_data->>'warna',o.warna),lengan=coalesce(p_data->>'lengan',o.lengan),cuttingan=coalesce(p_data->>'cuttingan',o.cuttingan),opsi=coalesce(p_data->>'opsi',o.opsi),qty=quantity,harga_satuan=unit,discount_type=discount_kind,discount_value=discount,total=total,sisa=total-paid,status_bayar=case when paid>=total then 'Lunas' when paid>0 then 'DP' else 'Belum Bayar' end where public.orders.id=o.id;
  output:=jsonb_build_object('id',o.id,'total',total,'nominal_dibayar',paid,'sisa',total-paid);

 elsif p_operation='create_product' then
  if coalesce(trim(p_data->>'nama'),'')='' or coalesce(trim(p_data->>'kategori'),'')='' or coalesce((p_data->>'harga')::numeric,-1)<0 then raise exception 'Invalid product'; end if;
  insert into public.products(nama,kategori,harga,badge,deskripsi,satuan,gambar,harga_nama,harga_angka,harga_nama_angka,sizes,colors,aktif)
  values(trim(p_data->>'nama'),trim(p_data->>'kategori'),(p_data->>'harga')::numeric,coalesce(p_data->>'badge',''),coalesce(p_data->>'deskripsi',''),coalesce(p_data->>'satuan','/pcs'),coalesce(p_data->>'gambar',''),coalesce((p_data->>'harga_nama')::numeric,0),coalesce((p_data->>'harga_angka')::numeric,0),coalesce((p_data->>'harga_nama_angka')::numeric,0),coalesce(p_data->>'sizes',''),coalesce(p_data->>'colors',''),true) returning public.products.id into id;
  output:=jsonb_build_object('id',id,'aktif',true);
 elsif p_operation in ('update_product','set_product_status') then
  select * into product from public.products where public.products.id=(p_data->>'id')::uuid for update;
  if not found then raise exception 'Product not found'; end if;
  if p_operation='set_product_status' then
   if product.aktif is distinct from (p_data->>'expectedActive')::boolean then return jsonb_build_object('ok',false,'code','PRODUCT_CONFLICT'); end if;
   update public.products set aktif=(p_data->>'aktif')::boolean where public.products.id=product.id;
   output:=jsonb_build_object('id',product.id,'aktif',(p_data->>'aktif')::boolean);
  else
   update public.products set nama=coalesce(p_data->>'nama',product.nama),kategori=coalesce(p_data->>'kategori',product.kategori),harga=coalesce((p_data->>'harga')::numeric,product.harga),badge=coalesce(p_data->>'badge',product.badge),deskripsi=coalesce(p_data->>'deskripsi',product.deskripsi),satuan=coalesce(p_data->>'satuan',product.satuan),gambar=coalesce(p_data->>'gambar',product.gambar),harga_nama=coalesce((p_data->>'harga_nama')::numeric,product.harga_nama),harga_angka=coalesce((p_data->>'harga_angka')::numeric,product.harga_angka),harga_nama_angka=coalesce((p_data->>'harga_nama_angka')::numeric,product.harga_nama_angka),sizes=coalesce(p_data->>'sizes',product.sizes),colors=coalesce(p_data->>'colors',product.colors),pinned=coalesce((p_data->>'pinned')::boolean,product.pinned) where public.products.id=product.id;
   output:=jsonb_build_object('id',product.id);
  end if;

 elsif p_operation='create_vendor' then
  if coalesce(trim(p_data->>'nama'),'')='' then raise exception 'Vendor name required'; end if;
  insert into public.vendors(nama,no_wa,catatan) values(trim(p_data->>'nama'),coalesce(p_data->>'no_wa',''),coalesce(p_data->>'catatan','')) returning public.vendors.id into id;
  output:=jsonb_build_object('id',id);
 elsif p_operation='update_vendor' then
  update public.vendors set nama=coalesce(p_data->>'nama',nama),no_wa=coalesce(p_data->>'no_wa',no_wa),catatan=coalesce(p_data->>'catatan',catatan) where public.vendors.id=(p_data->>'id')::uuid returning public.vendors.id into id;
  if not found then raise exception 'Vendor not found'; end if;
  output:=jsonb_build_object('id',id);

 elsif p_operation in ('add_order_payment','void_order_payment','cancel_order') then
  select * into o from public.orders where public.orders.id=(p_data->>'id')::uuid for update;
  if not found or o.status='Batal' then raise exception 'Order unavailable'; end if;
  select coalesce(sum(nominal),0) into paid from public.order_payments where id_pesanan=o.id;
  if paid is distinct from o.nominal_dibayar or paid is distinct from (p_data->>'expectedPaid')::numeric or paid<0 or paid>o.total then return jsonb_build_object('ok',false,'code','PAYMENT_CONFLICT'); end if;
  if p_operation='add_order_payment' then
   amount:=(p_data->>'nominal')::numeric; account_name:=trim(p_data->>'akun');
   if amount is null or amount<=0 or paid+amount>o.total or not exists(select 1 from public.accounts where nama=account_name) then raise exception 'Invalid payment'; end if;
   payment_type:=case when paid=0 then 'DP' when paid+amount=o.total then 'Pelunasan' else 'Cicilan' end;
   label:='Pembayaran MCP';
   insert into public.order_payments(id_pesanan,nominal,akun,tipe,keterangan) values(o.id,amount,account_name,payment_type,label) returning public.order_payments.id into id;
   insert into public.finance_transactions(tipe,sumber,id_pesanan,kategori,keterangan,nominal,akun) values('Masuk','Pesanan',o.id,'Pembayaran Pesanan',label,amount,account_name);
   paid:=paid+amount;
  elsif p_operation='void_order_payment' then
   select * into pay from public.order_payments where public.order_payments.id=(p_data->>'paymentId')::uuid and id_pesanan=o.id for update;
   if not found or pay.nominal<=0 or pay.tipe not in ('DP','Pelunasan','Cicilan') or pay.nominal>paid or exists(select 1 from public.order_payments where id_pesanan=o.id and keterangan like '%void:'||pay.id::text||'%') then raise exception 'Payment cannot be reversed'; end if;
   select coalesce(sum(nominal),0) into net from public.order_payments where id_pesanan=o.id and akun=pay.akun;
   if net<pay.nominal then raise exception 'Account payment net too low'; end if;
   label:='Koreksi void:'||pay.id::text;
   insert into public.order_payments(id_pesanan,nominal,akun,tipe,keterangan) values(o.id,-pay.nominal,pay.akun,'Koreksi',label) returning public.order_payments.id into id;
   insert into public.finance_transactions(tipe,sumber,id_pesanan,kategori,keterangan,nominal,akun) values('Keluar','Pesanan',o.id,'Koreksi Pembayaran',label,pay.nominal,pay.akun);
   paid:=paid-pay.nominal;
  else
   if o.status is distinct from p_data->>'expectedStatus' or o.status='Diambil' then return jsonb_build_object('ok',false,'code','STATUS_CONFLICT'); end if;
   if exists(select 1 from public.order_payments where id_pesanan=o.id group by akun having sum(nominal)<0 or akun is null or trim(akun)='') then raise exception 'Invalid account payment history'; end if;
   for r in select akun,sum(nominal) as nominal from public.order_payments where id_pesanan=o.id group by akun having sum(nominal)>0 loop
    insert into public.order_payments(id_pesanan,nominal,akun,tipe,keterangan) values(o.id,-r.nominal,r.akun,'Reversal','Pembatalan MCP');
    insert into public.finance_transactions(tipe,sumber,id_pesanan,kategori,keterangan,nominal,akun) values('Keluar','Pesanan',o.id,'Pembatalan Pesanan','Pembatalan MCP',r.nominal,r.akun);
   end loop;
   paid:=0;
  end if;
  status_new:=case when p_operation='cancel_order' then 'Batal' else o.status end;
  update public.orders set status=status_new,nominal_dibayar=paid,sisa=o.total-paid,status_bayar=case when status_new='Batal' then 'Belum Bayar' when paid>=o.total then 'Lunas' when paid>0 then 'DP' else 'Belum Bayar' end where public.orders.id=o.id;
  output:=jsonb_build_object('id',o.id,'paymentId',id,'status',status_new,'nominal_dibayar',paid,'sisa',o.total-paid);

 elsif p_operation in ('add_bulk_order_payment','void_bulk_order_payment','cancel_bulk_order') then
  select * into b from public.bulk_orders where public.bulk_orders.id=(p_data->>'id')::uuid for update;
  if not found or b.status='Batal' then raise exception 'Bulk order unavailable'; end if;
  select coalesce(sum(nominal),0) into paid from public.bulk_order_payments where bulk_order_id=b.id;
  if paid is distinct from b.nominal_dibayar or paid is distinct from (p_data->>'expectedPaid')::numeric or paid<0 or paid>b.total then return jsonb_build_object('ok',false,'code','PAYMENT_CONFLICT'); end if;
  if p_operation='add_bulk_order_payment' then
   amount:=(p_data->>'nominal')::numeric; account_name:=trim(p_data->>'akun');
   if amount is null or amount<=0 or paid+amount>b.total or not exists(select 1 from public.accounts where nama=account_name) then raise exception 'Invalid payment'; end if;
   perform public.append_bulk_order_payment(b.id,amount,account_name,'Pembayaran MCP');
  elsif p_operation='void_bulk_order_payment' then
   select * into bpay from public.bulk_order_payments where public.bulk_order_payments.id=(p_data->>'paymentId')::uuid and bulk_order_id=b.id for update;
   if not found or bpay.nominal<=0 or bpay.nominal>paid then raise exception 'Payment cannot be reversed'; end if;
   select coalesce(sum(nominal),0) into net from public.bulk_order_payments where bulk_order_id=b.id and akun=bpay.akun;
   if net<bpay.nominal then raise exception 'Account payment net too low'; end if;
   perform public.void_bulk_order_payment(b.id,bpay.id);
  else
   if b.status is distinct from p_data->>'expectedStatus' or b.status='Diambil' then return jsonb_build_object('ok',false,'code','STATUS_CONFLICT'); end if;
   if exists(select 1 from public.bulk_order_payments where bulk_order_id=b.id group by akun having sum(nominal)<0 or akun is null or trim(akun)='') then raise exception 'Invalid account payment history'; end if;
   perform public.set_bulk_order_status(b.id,'Batal');
  end if;
  select * into b from public.bulk_orders where public.bulk_orders.id=b.id;
  output:=jsonb_build_object('id',b.id,'status',b.status,'nominal_dibayar',b.nominal_dibayar,'sisa',b.sisa);

 elsif p_operation in ('create_expense','create_income') then
  amount:=(p_data->>'nominal')::numeric; account_name:=trim(p_data->>'akun');
  if amount is null or amount<=0 or not exists(select 1 from public.accounts where nama=account_name) or coalesce(trim(p_data->>'kategori'),'')='' then raise exception 'Invalid manual entry'; end if;
  insert into public.finance_transactions(tipe,sumber,kategori,keterangan,nominal,akun) values(case when p_operation='create_expense' then 'Keluar' else 'Masuk' end,'Manual',trim(p_data->>'kategori'),coalesce(p_data->>'keterangan',''),amount,account_name) returning public.finance_transactions.id into id;
  output:=jsonb_build_object('id',id,'nominal',amount,'akun',account_name);
 elsif p_operation='transfer_funds' then
  amount:=(p_data->>'nominal')::numeric; account_name:=trim(p_data->>'akun_sumber');
  if amount is null or amount<=0 or account_name=trim(p_data->>'akun_tujuan') or (select count(*) from public.accounts where nama in (account_name,trim(p_data->>'akun_tujuan')))<>2 then raise exception 'Invalid accounts or amount'; end if;
  transfer_id_new:=gen_random_uuid();
  label:=coalesce(nullif(trim(p_data->>'keterangan'),''),'Transfer MCP');
  insert into public.finance_transactions(tipe,sumber,kategori,keterangan,nominal,akun,akun_lawan,transfer_id,created_at) values
  ('Keluar','Transfer','Transfer Dana',label,amount,account_name,trim(p_data->>'akun_tujuan'),transfer_id_new,((p_data->>'tanggal')::date+time '12:00') at time zone 'UTC'),
  ('Masuk','Transfer','Transfer Dana',label,amount,trim(p_data->>'akun_tujuan'),account_name,transfer_id_new,((p_data->>'tanggal')::date+time '12:00') at time zone 'UTC');
  output:=jsonb_build_object('transfer_id',transfer_id_new,'nominal',amount,'ledger_only',true);
 elsif p_operation='void_transfer' then
  id:=(p_data->>'transferId')::uuid;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(id::text,1));
  perform 1 from public.finance_transactions where transfer_id=id order by public.finance_transactions.id for update;
  if exists(select 1 from public.finance_transactions where transfer_reversal_of=id) then raise exception 'Transfer already reversed'; end if;
  select count(*),coalesce(sum(case when tipe='Masuk' then nominal else -nominal end),0) into count_rows,net from public.finance_transactions where transfer_id=id and sumber='Transfer' and transfer_reversal_of is null and nominal>0 and tipe in ('Masuk','Keluar');
  if count_rows<>2 or net<>0 or (select count(*) from public.finance_transactions where transfer_id=id)<>2 or not exists(select 1 from public.finance_transactions a join public.finance_transactions c on a.transfer_id=c.transfer_id and a.id<>c.id where a.transfer_id=id and a.tipe='Masuk' and c.tipe='Keluar' and a.akun=c.akun_lawan and a.akun_lawan=c.akun and a.akun<>c.akun and a.nominal=c.nominal) then raise exception 'Invalid transfer pair'; end if;
  transfer_id_new:=gen_random_uuid();
  insert into public.finance_transactions(tipe,sumber,kategori,keterangan,nominal,akun,akun_lawan,transfer_id,transfer_reversal_of)
  select case when tipe='Keluar' then 'Masuk' else 'Keluar' end,'Transfer','Koreksi Transfer','Koreksi transfer MCP',nominal,akun,akun_lawan,transfer_id_new,id from public.finance_transactions where transfer_id=id;
  output:=jsonb_build_object('transfer_id',id,'reversal_id',transfer_id_new,'ledger_only',true);
 else
  return jsonb_build_object('ok',false,'code','INVALID_OPERATION');
 end if;
 output:=output||jsonb_build_object('ok',true,'operation',p_operation,'requestId',p_request_id,'replayed',false);
 insert into public.mcp_operation_receipts(request_id,actor_id,operation,input_hash,outcome) values(p_request_id,p_actor_id,p_operation,p_input_hash,output);
 return output;
end;
$mcp_ops$;
revoke all on function public.mcp_execute_operation_v2(uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mcp_execute_operation_v2(uuid,text,text,text,jsonb) to service_role;
commit;