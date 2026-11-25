import test from 'node:test';
import assert from 'node:assert/strict';
import endpoint from '../api/mcp.js';
const key='x'.repeat(40);
const envKeys=['MCP_API_KEY','MCP_OWNER_ID','MCP_API_SCOPES','MCP_ENABLE_STATUS_WRITE','MCP_ALLOW_QUERY_KEY','MCP_ENABLE_OPERATIONS','MCP_ENABLE_FINANCE_WRITE','MCP_ENABLE_MEDIA_WRITE'];
function setEnv(values) {
  const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
  for(const k of envKeys) if(values[k]===undefined)delete process.env[k];else process.env[k]=values[k];
  return ()=>{for(const k of envKeys)if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];};
}
async function call(body,{method='POST',auth=true,origin='https://chatgpt.com'}={}) {
  const output={headers:{},statusCode:200,body:null};
  const res={setHeader(k,v){output.headers[k.toLowerCase()]=v;return this;},status(n){output.statusCode=n;return this;},json(value){output.body=value;return this;},end(value){if(value!==undefined){try{output.body=JSON.parse(String(value));}catch{output.body=String(value);}}return this;}};
  const headers={'content-type':'application/json',accept:'application/json, text/event-stream',origin,'mcp-protocol-version':'2025-11-25',...(auth?{authorization:'Bearer '+key}:{})};
  await endpoint({method,url:'/api/mcp',headers,body},res);
  return output;
}
// Legacy Streamable HTTP can respond with SSE even when modern responseMode is JSON.
// Decode the wire response according to Content-Type, and match the JSON-RPC request ID.
function rpcResult(response,id) {
  const diagnostic=JSON.stringify({status:response.statusCode,contentType:response.headers['content-type'],body:response.body});
  assert.equal(response.statusCode,200,diagnostic);
  let messages;
  if ((response.headers['content-type']||'').includes('text/event-stream')) {
    assert.equal(typeof response.body,'string',diagnostic);
    messages=response.body.replace(/\r\n/g,'\n').split(/\n\n/).flatMap(frame=>{
      const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
      return data?[JSON.parse(data)]:[];
    });
  } else {
    messages=Array.isArray(response.body)?response.body:[response.body];
  }
  const reply=messages.find(value=>value&&value.id===id);
  assert.ok(reply,'Missing JSON-RPC reply: '+diagnostic);
  assert.equal(reply.jsonrpc,'2.0',diagnostic);
  assert.ok(!reply.error,'JSON-RPC error: '+JSON.stringify(reply.error));
  assert.ok(reply.result,'Missing result: '+diagnostic);
  return reply.result;
}
const message=(id,method,params={})=>({jsonrpc:'2.0',id,method,params});
test('HTTP transport: auth, initialize, list, info call and scoped tool visibility',async()=>{
  const restore=setEnv({MCP_API_KEY:key,MCP_OWNER_ID:'test-owner',MCP_API_SCOPES:'mcp:read,mcp:write'});
  try {
    const denied=await call(message(1,'tools/list'),{auth:false});
    assert.equal(denied.statusCode,401);
    assert.equal((await call(message(1,'tools/list'),{origin:'https://bad.example'})).statusCode,403);
    assert.equal((await call(null,{method:'GET'})).statusCode,405);
    assert.equal((await call(null,{method:'OPTIONS'})).statusCode,204);
    const init=await call(message(2,'initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1.0.0'}}));
    assert.equal(rpcResult(init,2).serverInfo.name,'tulehu-inkline');
    const initialized=await call({jsonrpc:'2.0',method:'notifications/initialized'});
    assert.equal(initialized.statusCode,202,JSON.stringify(initialized.body));
    const list=await call(message(3,'tools/list'));
    assert.equal(rpcResult(list,3).tools.length,28);
    const info=await call(message(4,'tools/call',{name:'get_mcp_info',arguments:{}}));
    const infoResult=rpcResult(info,4);
    assert.equal(JSON.parse(infoResult.content[0].text).mode,'read-only');
    process.env.MCP_ENABLE_STATUS_WRITE='true';
    const writable=await call(message(5,'tools/list'));
    const writableTools=rpcResult(writable,5).tools;
    assert.equal(writableTools.length,30);
    assert.ok(writableTools.some(t=>t.name==='update_order_status'));
  } finally {restore();}
});