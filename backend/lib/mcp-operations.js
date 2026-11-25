import { createHash } from 'node:crypto';
import { buildBulkOrderPayload, validateBulkPreviewInput } from './bulk-orders.js';
import { normVariant, calculateOrderPricing, pipeList } from './helpers.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid=v=>typeof v==='string'&&UUID.test(v);
const fail=(status,code)=>({status,body:{status:'error',code}});
const variants=['size','warna','lengan','cuttingan','opsi'];
const customer=['nama_customer','kontak','catatan'];
const price=['qty','harga_satuan','discount_type','discount_value'];
const products=['nama','kategori','harga','badge','deskripsi','satuan','gambar','harga_nama','harga_angka','harga_nama_angka','sizes','colors'];
const vendor=['nama','no_wa','catatan'];
const specs={
 create_order:[['id_produk','nama_customer','size','warna','lengan','qty','harga_satuan'],[...customer,...variants,...price,'id_produk']],
 update_order:[['id','expectedTotal','expectedPaid'],['id','expectedTotal','expectedPaid',...customer,...variants,...price]],
 create_bulk_order:[['id_produk','nama_customer','items','expectedTotal'],['id_produk',...customer,'items','expectedTotal','cuttingan','tambahan_harga_per_pcs','discount_type','discount_value']],
 create_product:[['nama','kategori','harga'],products],
 update_product:[['id'],['id',...products,'pinned']],
 set_product_status:[['id','aktif','expectedActive'],['id','aktif','expectedActive']],
 create_vendor:[['nama'],vendor],update_vendor:[['id'],['id',...vendor]],
 add_order_payment:[['id','nominal','akun','expectedPaid'],['id','nominal','akun','expectedPaid']],
 add_bulk_order_payment:[['id','nominal','akun','expectedPaid'],['id','nominal','akun','expectedPaid']],
 void_order_payment:[['id','paymentId','expectedPaid'],['id','paymentId','expectedPaid']],
 void_bulk_order_payment:[['id','paymentId','expectedPaid'],['id','paymentId','expectedPaid']],
 cancel_order:[['id','expectedStatus','expectedPaid'],['id','expectedStatus','expectedPaid']],
 cancel_bulk_order:[['id','expectedStatus','expectedPaid'],['id','expectedStatus','expectedPaid']],
 create_expense:[['nominal','akun','kategori'],['nominal','akun','kategori','keterangan']],
 create_income:[['nominal','akun','kategori'],['nominal','akun','kategori','keterangan']],
 transfer_funds:[['akun_sumber','akun_tujuan','nominal','tanggal'],['akun_sumber','akun_tujuan','nominal','tanggal','keterangan']],
 void_transfer:[['transferId'],['transferId']]
};
const high=new Set(['add_order_payment','add_bulk_order_payment','void_order_payment','void_bulk_order_payment','cancel_order','cancel_bulk_order','create_expense','create_income','transfer_funds','void_transfer']);
const numeric=new Set(['harga','harga_satuan','harga_nama','harga_angka','harga_nama_angka','nominal','expectedPaid','expectedTotal','qty','discount_value','tambahan_harga_per_pcs']);
const ids=new Set(['id','id_produk','paymentId','transferId']);
const bools=new Set(['aktif','expectedActive','pinned']);
const requiredText=new Set(['nama','nama_customer','kategori','size','warna','lengan','akun','akun_sumber','akun_tujuan','expectedStatus','satuan']);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function validateOperation(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||!Object.hasOwn(specs,body.operation)||body.confirm!==true||!isUuid(body.requestId))throw Error('INVALID_INPUT');
 const {operation,requestId,confirm,...input}=body;
 const [required,allowed]=specs[operation];
 if(required.some(k=>!Object.hasOwn(input,k))||Object.keys(input).some(k=>!allowed.includes(k)))throw Error('INVALID_INPUT');
 for(const [k,v] of Object.entries(input)){
  if(ids.has(k)){if(!isUuid(v))throw Error('INVALID_INPUT');}
  else if(bools.has(k)){if(typeof v!=='boolean')throw Error('INVALID_INPUT');}
  else if(numeric.has(k)){if(!Number.isSafeInteger(v)||v<0||v>1000000000||(k==='qty'&&(v<1||v>10000))||(k==='nominal'&&v<1))throw Error('INVALID_INPUT');}
  else if(k==='items'){if(!Array.isArray(v)||v.length<1||v.length>100)throw Error('INVALID_INPUT');}
  else if(typeof v!=='string'||v.length>(k==='gambar'?8000:2000)||(requiredText.has(k)&&!v.trim()))throw Error('INVALID_INPUT');
 }
 if(input.discount_type!==undefined&&!['nominal','percent'].includes(input.discount_type))throw Error('INVALID_INPUT');
 if(input.discount_type==='percent'&&input.discount_value>100)throw Error('INVALID_INPUT');
 if(input.cuttingan!==undefined&&!['Reguler','Oversize'].includes(input.cuttingan))throw Error('INVALID_INPUT');
 if(input.lengan!==undefined&&!['Lengan Pendek','Lengan Panjang'].includes(input.lengan))throw Error('INVALID_INPUT');
 if(operation==='transfer_funds'&&(!/^\d{4}-\d{2}-\d{2}$/.test(input.tanggal)||input.akun_sumber===input.akun_tujuan||!Number.isFinite(Date.parse(input.tanggal))||new Date(input.tanggal).toISOString().slice(0,10)!==input.tanggal))throw Error('INVALID_INPUT');
 if(operation.startsWith('update_')&&Object.keys(input).every(k=>['id','expectedPaid','expectedTotal'].includes(k)))throw Error('INVALID_INPUT');
 for(const k of ['gambar'])if(input[k]&&input[k].split('|').some(url=>{try{const u=new URL(url.trim());return u.protocol!=='https:'||u.username||u.password;}catch{return true;}}))throw Error('INVALID_INPUT');
 if(operation==='create_bulk_order')validateBulkPreviewInput(Object.fromEntries(Object.entries(input).filter(([k])=>['id_produk','cuttingan','tambahan_harga_per_pcs','discount_type','discount_value','items'].includes(k))));
 const hash=createHash('sha256').update(JSON.stringify(canonical({operation,input}))).digest('hex');
 return {operation,requestId,input,hash};
}
async function prepare(db,operation,input){
 const data={...input};
 for(const k of variants)if(k in data)data[k]=k==='opsi'?data[k].trim():normVariant(k,data[k]);
 for(const k of ['sizes','colors'])if(k in data)data[k]=pipeList(data[k]);
 if(operation==='create_order'||operation==='create_bulk_order'){
  const {data:product,error}=await db.from('products').select('id,nama,kategori,harga,sizes,colors,aktif').eq('id',data.id_produk).maybeSingle();
  if(error)throw Error('DB_ERROR');
  if(!product||product.aktif!==true)throw Error('PRODUCT_NOT_FOUND');
  if(operation==='create_bulk_order'){
   const preview=Object.fromEntries(Object.entries(data).filter(([k])=>['id_produk','cuttingan','tambahan_harga_per_pcs','discount_type','discount_value','items'].includes(k)));
   const validated=validateBulkPreviewInput(preview);
   const built=buildBulkOrderPayload({...validated,...Object.fromEntries(customer.filter(k=>k in data).map(k=>[k,data[k]])),nominal_dibayar:0},product,[]);
   if(built.items.reduce((sum,item)=>sum+item.total,0)!==data.expectedTotal)throw Error('PRICE_CHANGED');
   return {...built,expectedTotal:data.expectedTotal,catalog_price:product.harga,catalog_sizes:product.sizes,catalog_colors:product.colors};
  }
  const pricing=calculateOrderPricing({hargaSatuan:data.harga_satuan,qty:data.qty,discountType:data.discount_type,discountValue:data.discount_value});
  if(!pricing.ok)throw Error('INVALID_PRICING');
  return {...data,nama_produk:product.nama,kategori:product.kategori,discount_type:pricing.discountType,discount_value:pricing.discountValue};
 }
 return data;
}
export async function executeOperation(db,body,env=process.env){
 let request;
 try{request=validateOperation(body);}catch{return fail(400,'INVALID_INPUT');}
 const {operation,requestId,input,hash}=request;
 const actor=env.MCP_AUDIT_OWNER_ID?.trim();
 if(!actor||actor.length>120||env.MCP_ENABLE_OPERATIONS!=='true')return fail(503,'OPERATIONS_DISABLED');
 if(high.has(operation)&&env.MCP_ENABLE_FINANCE_WRITE!=='true')return fail(403,'FINANCE_DISABLED');
 try{
  // Existing receipts are checked before catalog preparation so a retry survives price changes.
  const prior=await db.from('mcp_operation_receipts').select('actor_id,operation,input_hash,outcome').eq('request_id',requestId).maybeSingle();
  if(prior.error)return fail(503,'AUDIT_UNAVAILABLE');
  if(prior.data){
   if(prior.data.actor_id!==actor||prior.data.operation!==operation||prior.data.input_hash!==hash)return fail(409,'IDEMPOTENCY_CONFLICT');
   return {status:200,body:{status:'success',data:{...prior.data.outcome,replayed:true}}};
  }
  const data=await prepare(db,operation,input);
  const result=await db.rpc('mcp_execute_operation_v2',{p_request_id:requestId,p_actor_id:actor,p_operation:operation,p_input_hash:hash,p_data:data});
  if(result.error)return fail(500,'OPERATION_REJECTED_OR_UNCERTAIN');
  const out=result.data;
  if(out?.ok!==true)return fail(409,typeof out?.code==='string'&&/^[A-Z_]{1,40}$/.test(out.code)?out.code:'OPERATION_REJECTED');
  if(out.operation!==operation||out.requestId!==requestId||typeof out.replayed!=='boolean')return fail(500,'INVALID_RECEIPT');
  return {status:200,body:{status:'success',data:out}};
 }catch(e){return fail(['PRODUCT_NOT_FOUND','PRICE_CHANGED','INVALID_PRICING'].includes(e.message)?409:500,['PRODUCT_NOT_FOUND','PRICE_CHANGED','INVALID_PRICING'].includes(e.message)?e.message:'OPERATION_REJECTED_OR_UNCERTAIN');}
}
export async function handleMcpOperation(db,req,res){const r=await executeOperation(db,req.body);return res.status(r.status).json(r.body);}