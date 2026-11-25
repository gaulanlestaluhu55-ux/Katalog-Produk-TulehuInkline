import test from 'node:test';
import assert from 'node:assert/strict';
import { getBulkBusinessRules, previewBulkOrder, validateBulkPreviewInput } from '../../backend/lib/bulk-orders.js';
import { createReadService } from '../lib/mcp/read-service.js';
const id='12345678-1234-4234-8234-123456789abc';
const other='12345678-1234-4234-8234-123456789abd';
const product={id,nama:'Kaos test',kategori:'Kaos',harga:100000,aktif:true};
const input={id_produk:id,discount_type:'percent',discount_value:10,items:[{size:'XXL',warna:'Hitam',lengan:'Lengan Panjang',qty:2},{size:'4',warna:'Putih',lengan:'Lengan Pendek',qty:1}]};
test('business rules read existing bulk pricing constants',()=>{
  const rules=getBulkBusinessRules();
  assert.equal(rules.contract,'bulk-pricing-v1');
  assert.equal(rules.kaos_surcharge.fivexl,20000);
  assert.equal(rules.kids_base['2-8'],70000);
  assert.equal(rules.discount_basis,'per pcs');
});
test('preview uses real pricing, size and sleeve surcharge, kids price and per-piece discount',()=>{
  const result=previewBulkOrder(input,product);
  assert.equal(result.preview,true);
  assert.equal(result.persisted,false);
  assert.equal(result.qty_total,3);
  assert.equal(result.subtotal,300000);
  assert.equal(result.total_discount,30000);
  assert.equal(result.total,270000);
  assert.equal(result.items[0].harga_satuan_normal,115000);
  assert.equal(result.items[1].harga_satuan_normal,70000);
  assert.equal(Object.hasOwn(result,'nama_customer'),false);
});
test('preview rejects duplicate normalized variants and invalid or financial fields',()=>{
  assert.throws(()=>validateBulkPreviewInput({...input,items:[input.items[0],{...input.items[0],size:'xxl',warna:'hitam'}]}),/duplikat/);
  for(const bad of [{...input,nominal_dibayar:1000},{...input,nama_customer:'x'},{...input,discount_value:101},{...input,items:[{...input.items[0],qty:0}]}]){
    assert.throws(()=>validateBulkPreviewInput(bad),/tidak valid/);
  }
  assert.throws(()=>previewBulkOrder(input,{...product,aktif:false}),/aktif/);
  assert.throws(()=>previewBulkOrder(input,{...product,sizes:'S'}),/tidak tersedia/);
});
function fixture(handler){
  const calls=[];
  const service=createReadService({env:{INKLINE_BACKEND_ADMIN_TOKEN:'dummy'},fetchImpl:async(url,opts)=>{
    calls.push({url:String(url),opts});
    const result=handler(new URL(url),opts);
    return result instanceof Response?result:Response.json({status:'success',data:result});
  }});
  return {service,calls};
}
const regular=[{id,nama_customer:'A',status:'Diproses',sisa:50000,qty:2,created_at:'2026-11-01T10:00:00Z'},{id:other,status:'Batal',sisa:90000,qty:5},{id:other,status:'Selesai',sisa:0,qty:1}];
const bulk=[{id:other,nama_customer:'B',status:'Siap Produksi',sisa:'120000',qty_total:10,created_at:'2026-11-02T10:00:00Z'},{id,status:'Menunggu DP',sisa:10000,qty_total:7}];
test('outstanding includes both order types, excludes cancellations and aggregates before paging',async()=>{
  const {service,calls}=fixture(url=>url.pathname.endsWith('/bulk-orders')?bulk:regular);
  const result=await service.outstanding({limit:1,offset:0,kind:'all'});
  assert.equal(result.observedOutstanding,180000);
  assert.equal(result.items[0].order_type,'bulk');
  assert.equal(result.nextOffset,1);
  assert.equal(result.availableFromBackend,3);
  assert.equal(calls.length,2);
  assert.match(result.completeness,/not yet verified/);
});
test('production queue matches existing active stock states and counts pcs',async()=>{
  const {service}=fixture(url=>url.pathname.endsWith('/bulk-orders')?bulk:regular);
  const result=await service.productionQueue({kind:'all',limit:20,offset:0});
  assert.equal(result.observedPieces,12);
  assert.equal(result.items.length,2);
  const filtered=await service.productionQueue({kind:'regular',limit:20,offset:0});
  assert.equal(filtered.observedPieces,2);
});
test('rules use GET and preview uses isolated PATCH, not order-creation POST',async()=>{
  const {service,calls}=fixture(url=>url.searchParams.get('action')==='mcp-rules'?getBulkBusinessRules():previewBulkOrder(input,product));
  assert.equal((await service.businessRules()).contract,'bulk-pricing-v1');
  assert.equal((await service.previewBulk(input)).total,270000);
  assert.equal(calls[0].opts.method,'GET');
  assert.match(calls[0].url,/action=mcp-rules$/);
  assert.equal(calls[1].opts.method,'PATCH');
  assert.match(calls[1].url,/action=mcp-preview$/);
  assert.deepEqual(JSON.parse(calls[1].opts.body),input);
});
test('old backend fallback and unexpected preview response are rejected',async()=>{
  const {service}=fixture(()=>[]);
  await assert.rejects(service.businessRules(),/not deployed/);
  await assert.rejects(service.previewBulk(input),/Unexpected backend preview/);
  const old=fixture(()=>new Response(null,{status:405}));
  await assert.rejects(old.service.previewBulk(input),/not deployed/);
});
