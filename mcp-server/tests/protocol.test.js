import test from 'node:test';
import assert from 'node:assert/strict';
import { createInklineMcpServer } from '../lib/mcp/server.js';

for(const writable of [false,true]) test('MCP initialize and tools/list expose '+(writable?23:21)+' scoped tools',async()=>{
  const server=createInklineMcpServer({ownerId:'test',scopes:writable?['mcp:read','mcp:write']:['mcp:read']});
  const outbound=[];
  const transport={async start(){},async send(message){outbound.push(message);},async close(){}};
  await server.connect(transport);
  async function dispatch(message) {
    await transport.onmessage?.(message);
    for(let i=0;i<50;i++){
      const response=outbound.find(item=>item.id===message.id);
      if(response) return response;
      await new Promise(resolve=>setImmediate(resolve));
    }
    throw new Error('No MCP response');
  }
  try {
    const init=await dispatch({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1.0.0'}}});
    assert.equal(init.result.serverInfo.name,'tulehu-inkline');
    await transport.onmessage?.({jsonrpc:'2.0',method:'notifications/initialized'});
    const result=await dispatch({jsonrpc:'2.0',id:2,method:'tools/list',params:{}});
    const tools=result.result.tools;
    assert.equal(tools.length,writable?23:21);
    for(const name of ['get_bulk_order','get_business_rules','get_outstanding_payments','get_production_queue','preview_bulk_order']) assert.ok(tools.some(t=>t.name===name));
    assert.equal(tools.filter(t=>t.annotations.readOnlyHint===true).length,21);
    assert.equal(tools.some(t=>t.name==='update_order_status'),writable);
    assert.equal(tools.some(t=>t.name==='update_bulk_order_status'),writable);
    assert.ok(!tools.some(t=>/^(create|add|void|cancel|delete|transfer)_/.test(t.name)));
  } finally {await server.close();}
});