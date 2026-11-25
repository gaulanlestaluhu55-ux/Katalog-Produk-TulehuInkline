import test from 'node:test';
import assert from 'node:assert/strict';
import {OPERATIONS,createOperationService} from '../lib/mcp/operations.js';
import {validateOperation,executeOperation} from '../../backend/lib/mcp-operations.js';
import {uploadProductImage} from '../../backend/lib/mcp-media.js';
import {authorize} from '../lib/mcp/auth.js';
import {createReadService} from '../lib/mcp/read-service.js';
const id='12345678-1234-4234-8234-123456789abc',requestId='12345678-1234-4234-8234-123456789abd';
const body={operation:'create_vendor',requestId,confirm:true,nama:'Vendor test'};
const env={MCP_AUDIT_OWNER_ID:'owner',MCP_ENABLE_OPERATIONS:'true'};
test('18 DB operation schemas and explicit confirmation; invalid date is rejected',()=>{
 assert.equal(Object.keys(OPERATIONS).length,18);
 assert.throws(()=>OPERATIONS.create_vendor.schema.parse({...body,confirm:false}));
 assert.throws(()=>validateOperation({...body,confirm:false}));
 assert.throws(()=>validateOperation({...body,actor_id:'spoof'}));
 assert.throws(()=>validateOperation({...body,operation:'transfer_funds',akun_sumber:'A',akun_tujuan:'B',nominal:1,tanggal:'2026-02-30'}));
 assert.ok(OPERATIONS.transfer_funds.schema.safeParse({requestId,confirm:true,akun_sumber:'A',akun_tujuan:'B',nominal:1,tanggal:'2026-11-25'}).success);
});
test('operation hash stable with field order; different payload changes hash',()=>{
 const a=validateOperation(body),b=validateOperation({nama:body.nama,confirm:true,requestId,operation:body.operation});
 assert.equal(a.hash,b.hash);assert.notEqual(a.hash,validateOperation({...body,nama:'different'}).hash);
});
function fixture(prior=null,result=null){
 const calls=[];const db={from(table){assert.equal(table,'mcp_operation_receipts');return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:prior};}};},async rpc(name,args){calls.push({name,args});return {data:result||{ok:true,operation:args.p_operation,requestId:args.p_request_id,id,replayed:false}};}};
 return {db,calls};
}
test('new operation uses audited RPC only; no finance without explicit flag',async()=>{
 const {db,calls}=fixture();
 assert.equal((await executeOperation(db,body,env)).status,200);
 assert.equal(calls[0].name,'mcp_execute_operation_v2');
 assert.equal(calls[0].args.p_actor_id,'owner');
 assert.equal((await executeOperation(db,{operation:'create_income',requestId,confirm:true,nominal:5000,akun:'Kas',kategori:'Modal'},env)).status,403);
 assert.equal(calls.length,1);
});
test('replay is historical; altered request ID payload cannot run',async()=>{
 const prior={actor_id:'owner',operation:body.operation,input_hash:validateOperation(body).hash,outcome:{ok:true,operation:body.operation,requestId,id,replayed:false}};
 const {db,calls}=fixture(prior);
 assert.equal((await executeOperation(db,body,env)).body.data.replayed,true);
 assert.equal((await executeOperation(db,{...body,nama:'different'},env)).status,409);
 assert.equal(calls.length,0);
});
test('client uses dedicated PATCH and checks exact receipt; finance gated',async()=>{
 const calls=[];
 const run=createOperationService({env:{MCP_ENABLE_OPERATIONS:'true',INKLINE_BACKEND_ADMIN_TOKEN:'dummy'},fetchImpl:async(url,opts)=>{calls.push({url,opts});return Response.json({status:'success',data:{ok:true,operation:'create_vendor',requestId,replayed:false,id}});}});
 const args={requestId,confirm:true,nama:'Vendor test'};
 assert.equal((await run('create_vendor',args)).id,id);
 assert.equal(calls[0].opts.method,'PATCH');
 assert.match(calls[0].url,/action=mcp-operation-v2$/);
 await assert.rejects(run('create_income',{requestId,confirm:true,nominal:1,akun:'Kas',kategori:'Modal'}),/disabled/);
 assert.equal(calls.length,1);
});
test('all new scopes explicitly gated',()=>{
 const key='x'.repeat(40);
 const e={MCP_API_KEY:key,MCP_OWNER_ID:'owner',MCP_API_SCOPES:'mcp:read,mcp:write,mcp:high-impact',MCP_ENABLE_STATUS_WRITE:'true',MCP_ENABLE_OPERATIONS:'true',MCP_ENABLE_FINANCE_WRITE:'true',MCP_ENABLE_MEDIA_WRITE:'true'};
 const req=new Request('https://example.com/api/mcp',{headers:{authorization:'Bearer '+key}});
 assert.deepEqual(authorize(req,e).authInfo.scopes,['mcp:read','mcp:write','mcp:operations','mcp:high-impact','mcp:media']);
 assert.deepEqual(authorize(req,{...e,MCP_ENABLE_OPERATIONS:'false'}).authInfo.scopes,['mcp:read','mcp:write']);
});
test('account ledger balances include transfers, not actual bank balances',async()=>{
 const service=createReadService({env:{INKLINE_BACKEND_ADMIN_TOKEN:'dummy'},fetchImpl:async url=>Response.json({status:'success',data:url.pathname.endsWith('accounts')?[{id,nama:'A'},{nama:'B'}]:[{akun:'A',tipe:'Masuk',nominal:100},{akun:'A',tipe:'Keluar',nominal:30,sumber:'Transfer'},{akun:'B',tipe:'Masuk',nominal:30,sumber:'Transfer'}]},{headers:{'X-Inkline-Read-Contract':'paged-v1'}})});
 const r=await service.accountBalances();
 assert.deepEqual(r.items.map(x=>x.saldo),[70,30]);
});
test('media rejects untrusted hosts before fetch; uploads approved PNG with overwrite=false',async()=>{
 const env={MCP_ENABLE_MEDIA_WRITE:'true',MCP_MEDIA_ALLOWED_HOSTS:'files.example.com',CLOUDINARY_CLOUD_NAME:'demo',CLOUDINARY_API_KEY:'dummy',CLOUDINARY_API_SECRET:'dummy'};
 const file={file_id:'file-test',download_url:'https://files.example.com/a',mime_type:'image/png'};
 let calls=0;
 const fetchImpl=async(url,opts)=>{calls++;if(calls===1)return new Response(Uint8Array.from([137,80,78,71,13,10,26,10,0]));assert.equal(opts.body.get('overwrite'),'false');return Response.json({public_id:'inkline-mcp/'+requestId,secure_url:'https://res.cloudinary.com/demo/image/upload/test.png'});};
 await assert.rejects(uploadProductImage({requestId,confirm:true,file:{...file,download_url:'https://untrusted.example/a'}},{env,fetchImpl}),/FILE_HOST_NOT_ALLOWED/);
 assert.equal(calls,0);
 const out=await uploadProductImage({requestId,confirm:true,file},{env,fetchImpl});
 assert.equal(out.linked,false);assert.equal(calls,2);
});