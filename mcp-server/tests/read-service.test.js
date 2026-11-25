import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadService } from '../lib/mcp/read-service.js';
const id='12345678-1234-4234-8234-123456789abc';
const other='12345678-1234-4234-8234-123456789abd';
const data=[{id,nama_customer:'Customer A',nama_produk:'Kaos',status:'Diproses',status_bayar:'DP',kontak:'private',qty:2},{id:other,nama_customer:'Customer B',status:'Selesai',status_bayar:'Lunas'}];
function fixture(payload=data) {
  const calls=[];
  const service=createReadService({env:{INKLINE_BACKEND_ADMIN_TOKEN:'dummy'},fetchImpl:async(url,opts)=>{
    calls.push({url:String(url),opts});return Response.json({status:'success',data:payload});
  }});
  return {calls,service};
}
test('search, pagination, field minimization and GET-only',async()=>{
  const {calls,service}=fixture();
  const result=await service.listOrders({query:'customer a',paymentStatus:'DP',limit:1,offset:0});
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].id,id);
  assert.equal(Object.hasOwn(result.items[0],'kontak'),false);
  assert.equal(calls[0].opts.method,'GET');
  assert.equal(calls[0].opts.redirect,'error');
  assert.equal(calls[0].url,'https://katalog-produk-tulehu-inkline.vercel.app/api/orders');
  assert.equal(calls[0].opts.headers.Authorization,'Bearer dummy');
  assert.equal((await service.listOrders({limit:1,offset:0})).nextOffset,1);
});
test('invalid id cannot control backend route',async()=>{
  const {calls,service}=fixture();
  await assert.rejects(service.getBulkOrder('../finance'),/Invalid resource/);
  assert.equal(calls.length,0);
});
test('regular detail uses exact ID',async()=>{
  const {service}=fixture();
  assert.equal((await service.getOrder(id)).id,id);
  await assert.rejects(service.getOrder('missing'),/not found/);
});
test('bulk payments path and dashboard query',async()=>{
  const {calls,service}=fixture([]);
  await service.getOrderPayments('bulk-orders',id);
  await service.dashboard('summary','1m',20);
  assert.equal(calls[0].url,'https://katalog-produk-tulehu-inkline.vercel.app/api/bulk-orders/'+id+'?action=payments');
  assert.match(calls[1].url,/dashboard\?type=summary&range=1m&limit=20$/);
});
test('upstream error body never returned',async()=>{
  const service=createReadService({env:{INKLINE_BACKEND_ADMIN_TOKEN:'dummy'},fetchImpl:async()=>new Response('SECRET',{status:500})});
  await assert.rejects(service.listAccounts(),/^Error: Backend request failed \(500\)\.$/);
});
test('missing backend credential fails without fetching',async()=>{
  const service=createReadService({env:{},fetchImpl:async()=>{throw new Error('must not fetch');}});
  await assert.rejects(service.listAccounts(),/not configured/);
});
