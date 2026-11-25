import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatusWriteService } from '../lib/mcp/status-write-service.js';
const id='12345678-1234-4234-8234-123456789abc';
const requestId='12345678-1234-4234-8234-123456789abd';
const input={id,requestId,expectedStatus:'Baru',status:'Diproses'};
const env={MCP_ENABLE_STATUS_WRITE:'true',INKLINE_BACKEND_ADMIN_TOKEN:'dummy'};
function fixture(response,settings=env) {
  const calls=[];
  const service=createStatusWriteService({env:settings,fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return response;}});
  return {calls,service};
}
test('write uses dedicated PATCH, expected status and only permitted fields',async()=>{
  const {calls,service}=fixture(Response.json({status:'success',data:{id,status:'Diproses',changed:true,request_id:requestId,replayed:false}}));
  assert.equal((await service.updateRegular(input)).changed,true);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/api\/orders\/.+\?action=mcp-status-audited$/);
  assert.equal(calls[0].options.method,'PATCH');
  assert.deepEqual(JSON.parse(calls[0].options.body),{expected_status:'Baru',status:'Diproses',request_id:requestId});
  assert.equal(calls[0].options.redirect,'error');
});
test('bulk uses dedicated route and handles already-applied response',async()=>{
  const {calls,service}=fixture(Response.json({status:'success',data:{id,status:'Diproses',changed:false,request_id:requestId,replayed:true}}));
  assert.equal((await service.updateBulk({id,requestId,expectedStatus:'Siap Produksi',status:'Diproses'})).changed,false);
  assert.match(calls[0].url,/\/api\/bulk-orders\//);
});
test('flag off, cancellation and reopening denied without request',async()=>{
  const off=fixture(null,{});
  await assert.rejects(off.service.updateRegular(input),/disabled/);
  assert.equal(off.calls.length,0);
  const {calls,service}=fixture(null);
  await assert.rejects(service.updateRegular({...input,status:'Batal'}),/Invalid status/);
  await assert.rejects(service.updateRegular({...input,expectedStatus:'Batal'}),/Invalid status/);
  await assert.rejects(service.updateRegular({...input,expectedStatus:'Diambil'}),/Invalid status/);
  await assert.rejects(service.updateRegular({...input,requestId:undefined}),/Invalid status/);
  assert.equal(calls.length,0);
});
test('conflict and missing endpoint are reported without retry',async()=>{
  for(const [status,pattern] of [[409,/conflict/],[405,/not deployed/],[503,/No fallback/],[500,/uncertain/]]){
    const {calls,service}=fixture(new Response('PRIVATE',{status}));
    await assert.rejects(service.updateRegular(input),pattern);
    assert.equal(calls.length,1);
  }
});
test('unexpected success body is not reported as successful',async()=>{
  const {service}=fixture(Response.json({status:'success',data:{id,status:'Diproses'}}));
  await assert.rejects(service.updateRegular(input),/uncertain/);
});