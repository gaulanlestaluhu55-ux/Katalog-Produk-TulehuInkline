import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAuditedOrderStatus } from '../../backend/lib/mcp-order-status.js';
const id='12345678-1234-4234-8234-123456789abc';
const request_id='12345678-1234-4234-8234-123456789abd';
const body={request_id,expected_status:'Baru',status:'Diproses'};
const env={MCP_AUDIT_OWNER_ID:'owner'};
const receipt={ok:true,id,status:'Diproses',request_id,changed:true,replayed:false};
function fixture(result={data:receipt}){
  const calls=[];
  const db={async rpc(name,args){calls.push({name,args});return result;},from(){throw Error('Direct DB fallback forbidden');}};
  return {db,calls};
}
test('audited regular status uses only RPC and server-side actor',async()=>{
  const {db,calls}=fixture();
  const result=await executeAuditedOrderStatus(db,'regular',id,body,env);
  assert.equal(result.status,200);
  assert.deepEqual(calls,[{name:'mcp_set_order_status_audited',args:{p_request_id:request_id,p_actor_id:'owner',p_kind:'regular',p_order_id:id,p_expected_status:'Baru',p_target_status:'Diproses'}}]);
  assert.equal(result.body.data.replayed,false);
});
test('replayed receipt is returned as historical outcome',async()=>{
  const {db}=fixture({data:{...receipt,replayed:true}});
  assert.equal((await executeAuditedOrderStatus(db,'regular',id,body,env)).body.data.replayed,true);
});
test('cancel, reopening handover, payment fields, invalid ID and absent request ID rejected',async()=>{
  const {db,calls}=fixture();
  for(const [orderId,payload] of [[id,{...body,status:'Batal'}],[id,{...body,expected_status:'Batal'}],[id,{...body,expected_status:'Diambil'}],[id,{...body,nominal_dibayar:0}],[id,{...body,actor_id:'spoof'}],[id,{...body,request_id:undefined}],['invalid',body]]){
    assert.equal((await executeAuditedOrderStatus(db,'regular',orderId,payload,env)).status,400);
  }
  assert.equal(calls.length,0);
});
test('bulk uses same audited RPC with explicit bulk kind',async()=>{
  const {db,calls}=fixture({data:{...receipt,status:'Selesai Produksi'}});
  assert.equal((await executeAuditedOrderStatus(db,'bulk',id,{...body,expected_status:'Siap Produksi',status:'Selesai Produksi'},env)).status,200);
  assert.equal(calls[0].args.p_kind,'bulk');
});
test('status conflict, idempotency conflict and missing order mapped to safe errors',async()=>{
  for(const [code,status] of [['STATUS_CONFLICT',409],['IDEMPOTENCY_CONFLICT',409],['NOT_FOUND',404]]){
    const {db}=fixture({data:{ok:false,code}});
    const result=await executeAuditedOrderStatus(db,'regular',id,body,env);
    assert.equal(result.status,status);
    assert.equal(result.body.code,code);
  }
});
test('missing audit configuration or RPC and malformed receipt fail closed',async()=>{
  const {db,calls}=fixture();
  assert.equal((await executeAuditedOrderStatus(db,'regular',id,body,{})).status,503);
  assert.equal(calls.length,0);
  for(const [result,expected] of [[{error:{code:'PGRST202',message:'PRIVATE'}},503],[{error:{code:'XX000',message:'PRIVATE'}},500],[{data:{...receipt,request_id:'wrong'}},500]]){
    const failed=await executeAuditedOrderStatus(fixture(result).db,'regular',id,body,env);
    assert.equal(failed.status,expected);
    assert.doesNotMatch(JSON.stringify(failed),/PRIVATE/);
  }
});
