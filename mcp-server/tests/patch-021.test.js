import test from 'node:test';
import assert from 'node:assert/strict';
import {readAllRows} from '../../backend/lib/read-all.js';
import {previewBulkOrder,validateBulkPreviewInput,bulkValidationCode} from '../../backend/lib/bulk-orders.js';
import {executeOperation,validateOperation} from '../../backend/lib/mcp-operations.js';
import {createReadService} from '../lib/mcp/read-service.js';
const id='12345678-1234-4234-8234-123456789abc';
const product={id,nama:'Kaos Banda Neira 2',kategori:'Kaos',harga:120000,aktif:true,sizes:'L|XXL|3XL',colors:'Hitam'};
const item={size:'L',warna:'Hitam',lengan:'Lengan Pendek',qty:2};
const input={id_produk:id,items:[item,{...item,size:'l',warna:'hitam',qty:3}]};
test('duplicate and mixed variants keep price and quantity; nonpersistent preview',()=>{
 const p=previewBulkOrder({...input,items:[...input.items,{...item,size:'XXL',qty:1}]},product);
 assert.equal(p.items.length,2);
 assert.equal(p.qty_total,6);
 assert.equal(p.total,725000);
 assert.equal(p.persisted,false);
 assert.equal(p.items[0].qty,5);
});
test('merged quantity cap and invalid variant produce specific safe code',()=>{
 assert.throws(()=>validateBulkPreviewInput({...input,items:[{...item,qty:6000},{...item,qty:5000}]}),e=>bulkValidationCode(e)==='BULK_QTY_LIMIT');
 assert.throws(()=>previewBulkOrder({...input,items:[{...item,size:'S'}]},product),e=>bulkValidationCode(e)==='BULK_SIZE_UNAVAILABLE');
});
test('create bulk request merges using backend validator before atomic RPC, preserves raw retry hash',async()=>{
 let prepared;
 const db={from(table){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:table==='products'?product:null};}};},async rpc(name,args){prepared=args;return {data:{ok:true,operation:args.p_operation,requestId:args.p_request_id,replayed:false,id}};}};
 const body={...input,operation:'create_bulk_order',requestId:id,confirm:true,nama_customer:'Test',expectedTotal:600000};
 const r=await executeOperation(db,body,{MCP_ENABLE_OPERATIONS:'true',MCP_AUDIT_OWNER_ID:'owner'});
 assert.equal(r.status,200);
 assert.equal(prepared.p_data.items.length,1);
 assert.equal(prepared.p_data.items[0].qty,5);
 assert.equal(prepared.p_data.items[0].total,600000);
 assert.equal(prepared.p_input_hash,validateOperation(body).hash);
 const wrong=await executeOperation(db,{...body,expectedTotal:1},{MCP_ENABLE_OPERATIONS:'true',MCP_AUDIT_OWNER_ID:'owner'});
 assert.equal(wrong.status,409);
 assert.equal(wrong.body.code,'PRICE_CHANGED');
});
function factory(rows,cap=500){
 const offsets=[];
 return {offsets,query:()=>({order(){return this;},async range(start,end){offsets.push(start);return {data:rows.slice(start,Math.min(end+1,start+cap)),count:rows.length};}})};
}
test('pagination reads >1000 rows and tolerates smaller server row caps',async()=>{
 const rows=Array.from({length:1205},(_,i)=>({id:String(i)}));
 const f=factory(rows,200);
 const result=await readAllRows(f.query);
 assert.equal(result.error,null);
 assert.equal(result.data.length,1205);
 assert.deepEqual(f.offsets,[0,200,400,600,800,1000,1200]);
});
test('pagination rejects missing counts, duplicates, changed counts, empty gaps and safety ceiling',async()=>{
 for(const pages of [
  [{data:[{id:'1'}],count:null}],
  [{data:[{id:'1'}],count:2},{data:[{id:'1'}],count:2}],
  [{data:[{id:'1'}],count:2},{data:[{id:'2'}],count:3}],
  [{data:[{id:'1'}],count:2},{data:[],count:2}],
  [{data:[],count:50001}]
 ]){
  let i=0;
  const r=await readAllRows(()=>({order(){return this;},async range(){return pages[i++];}}));
  assert.equal(r.error.code,'MCP_READ_INCOMPLETE');
  assert.equal(r.data,null);
 }
});
test('pagination supports stock composite key',async()=>{
 const f=factory([{key:'a'},{key:'b'}],1);
 assert.equal((await readAllRows(f.query,{key:'key'})).data.length,2);
});
test('MCP refuses unverified backend totals and never echoes arbitrary validation text',async()=>{
 const service=createReadService({env:{INKLINE_BACKEND_ADMIN_TOKEN:'dummy'},fetchImpl:async()=>Response.json({status:'success',data:[]})});
 await assert.rejects(service.accountBalances(),/pagination contract unavailable/);
 const errors=createReadService({env:{INKLINE_BACKEND_ADMIN_TOKEN:'dummy'},fetchImpl:async()=>Response.json({status:'error',code:'BULK_SIZE_UNAVAILABLE',message:'SECRET'},{status:400})});
 await assert.rejects(errors.previewBulk(input),e=>/Ukuran tidak tersedia/.test(e.message)&&!e.message.includes('SECRET'));
 const unknown=createReadService({env:{INKLINE_BACKEND_ADMIN_TOKEN:'dummy'},fetchImpl:async()=>Response.json({status:'error',code:'UNTRUSTED',message:'SECRET'},{status:400})});
 await assert.rejects(unknown.previewBulk(input),/^Error: Backend request failed \(400\)\.$/);
});
