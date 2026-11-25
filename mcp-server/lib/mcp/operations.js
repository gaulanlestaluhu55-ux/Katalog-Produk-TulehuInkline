import { backendErrorMessage } from './backend-errors.js';
import {z} from 'zod';
const uuid=z.string().uuid(), text=z.string().trim().max(2000), name=z.string().trim().min(1).max(160);
const money=z.number().int().min(0).max(1000000000), positive=money.min(1), qty=z.number().int().min(1).max(10000);
const discount={discount_type:z.enum(['nominal','percent']).optional(),discount_value:money.optional()};
const variant={size:name,warna:name,lengan:z.enum(['Lengan Pendek','Lengan Panjang']),cuttingan:z.enum(['Reguler','Oversize']).optional(),opsi:text.optional()};
const customer={nama_customer:name,kontak:text.optional(),catatan:text.optional()};
const product={nama:name,kategori:name,harga:money,badge:text.optional(),deskripsi:text.optional(),satuan:name.optional(),gambar:z.string().max(8000).optional(),harga_nama:money.optional(),harga_angka:money.optional(),harga_nama_angka:money.optional(),sizes:text.optional(),colors:text.optional()};
const vendor={nama:name,no_wa:text.optional(),catatan:text.optional()};
const partial=shape=>Object.fromEntries(Object.entries(shape).map(([k,v])=>[k,v.optional()]));
const common={requestId:uuid,confirm:z.literal(true)};
const target={id:uuid};
const payment={...target,nominal:positive,akun:name,expectedPaid:money};
const correction={...target,paymentId:uuid,expectedPaid:money};
const cancellation={...target,expectedStatus:name,expectedPaid:money};
const finance={nominal:positive,akun:name,kategori:name,keterangan:text.optional()};
const schema=shape=>z.object({...common,...shape}).strict();
export const OPERATIONS={
 create_order:{schema:schema({...customer,...variant,...discount,id_produk:uuid,qty,harga_satuan:money}),description:'Create regular order with explicitly agreed unit price, no initial payment. Product identity comes from catalog.'},
 update_order:{schema:schema({...target,expectedTotal:money,expectedPaid:money,...partial({...customer,...variant,...discount,qty,harga_satuan:money})}),description:'Patch regular order fields, preserve omitted values. Read current order first; require expected total and paid amount. No status or payment changes.'},
 create_bulk_order:{schema:schema({...customer,id_produk:uuid,cuttingan:variant.cuttingan,tambahan_harga_per_pcs:money.optional(),...discount,expectedTotal:money,items:z.array(z.object({size:name,warna:name,lengan:variant.lengan,qty}).strict()).min(1).max(100)}),description:'Create bulk order without DP. Identical normalized variants are merged. Preview first and supply exact expectedTotal.'},
 create_product:{schema:schema(product),description:'Create a catalog product.'},
 update_product:{schema:schema({...target,...partial({...product,pinned:z.boolean()})}),description:'Patch catalog product fields; omitted fields preserved.'},
 set_product_status:{schema:schema({...target,aktif:z.boolean(),expectedActive:z.boolean()}),description:'Set exact catalog active status; never toggle blindly.'},
 create_vendor:{schema:schema(vendor),description:'Create vendor record, no external contact.'},
 update_vendor:{schema:schema({...target,...partial(vendor)}),description:'Patch vendor record, no external contact.'},
 add_order_payment:{schema:schema(payment),high:true,description:'Record actual regular payment in order history and ledger; not a bank transfer.'},
 void_order_payment:{schema:schema(correction),high:true,description:'Reverse one exact regular payment into original account.'},
 cancel_order:{schema:schema(cancellation),high:true,description:'Cancel regular order and reverse recorded net payments by original account.'},
 add_bulk_order_payment:{schema:schema(payment),high:true,description:'Record actual bulk payment in history and ledger.'},
 void_bulk_order_payment:{schema:schema(correction),high:true,description:'Reverse one exact bulk payment into original account.'},
 cancel_bulk_order:{schema:schema(cancellation),high:true,description:'Cancel bulk order and reverse recorded net payments.'},
 create_expense:{schema:schema(finance),high:true,description:'Record actual manual business expense.'},
 create_income:{schema:schema(finance),high:true,description:'Record actual manual income; do not duplicate order payments.'},
 transfer_funds:{schema:schema({akun_sumber:name,akun_tujuan:name,nominal:positive,tanggal:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),keterangan:text.optional()}),high:true,description:'Record internal accounting transfer as balanced ledger entries. Does not move real money.'},
 void_transfer:{schema:schema({transferId:uuid}),high:true,description:'Reverse both sides of an existing ledger transfer by transfer_id.'}
};
export const uploadSchema=schema({file:z.object({download_url:z.string().url(),file_id:z.string().min(1).max(512),mime_type:z.string().max(200).optional(),file_name:z.string().max(512).optional()}).strict()});
const ORIGIN='https://katalog-produk-tulehu-inkline.vercel.app';
export function createOperationService({env=process.env,fetchImpl=fetch}={}){
 return async function run(operation,input){
  if(env.MCP_ENABLE_OPERATIONS!=='true')throw Error('Backend operations disabled.');
  if(!Object.hasOwn(OPERATIONS,operation))throw Error('Invalid resource.');
  if(OPERATIONS[operation].high&&env.MCP_ENABLE_FINANCE_WRITE!=='true')throw Error('Backend financial operations disabled.');
  const body=OPERATIONS[operation].schema.parse(input);
  const token=env.INKLINE_BACKEND_ADMIN_TOKEN?.trim();
  if(!token)throw Error('Backend connection is not configured.');
  let response;
  try{response=await fetchImpl(ORIGIN+'/api/orders?action=mcp-operation-v2',{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({operation,...body}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});}
  catch{throw Error('Backend operation outcome uncertain. Reuse the same requestId; never create a new ID for retry.');}
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.status!=='success'||result.data?.requestId!==body.requestId||result.data?.operation!==operation||result.data?.ok!==true)throw Error('Backend operation failed ('+response.status+'). '+(backendErrorMessage(result?.code)?backendErrorMessage(result.code)+' ':'')+'Read current state; reuse same requestId for retry.');
  return result.data;
 };
}
export function createMediaService({env=process.env,fetchImpl=fetch}={}){
 return async input=>{
  if(env.MCP_ENABLE_MEDIA_WRITE!=='true')throw Error('Backend media disabled.');
  const body=uploadSchema.parse(input),token=env.INKLINE_BACKEND_ADMIN_TOKEN?.trim();
  if(!token)throw Error('Backend connection is not configured.');
  try{
   const r=await fetchImpl(ORIGIN+'/api/orders?action=mcp-upload-v2',{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(29000)});
   const out=await r.json().catch(()=>null);
   if(!r.ok||out?.status!=='success'||out.data?.requestId!==body.requestId||out.data?.linked!==false)throw Error('Upload failed.');
   return out.data;
  }catch{throw Error('Backend upload failed or uncertain. Check Cloudinary public ID before retrying same requestId; never overwrite.');}
 };
}