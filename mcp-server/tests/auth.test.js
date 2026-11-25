import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize, allowedOrigin } from '../lib/mcp/auth.js';
const key='x'.repeat(40);
const env={MCP_API_KEY:key,MCP_OWNER_ID:'owner-test',MCP_API_SCOPES:'mcp:read,mcp:write,mcp:high-impact'};
const req=(headers={},suffix='')=>new Request('https://mcp.tulehuinkline.my.id/api/mcp'+suffix,{method:'POST',headers});
test('missing config fails closed',()=>assert.equal(authorize(req(),{}).status,503));
test('unauthenticated and wrong token rejected',()=>{
  assert.equal(authorize(req(),env).status,401);
  assert.equal(authorize(req({authorization:'Bearer nope'}),env).status,401);
});
test('valid bearer is restricted to read',()=>{
  const result=authorize(req({authorization:'Bearer '+key}),env);
  assert.equal(result.authInfo.extra.ownerId,'owner-test');
  assert.deepEqual(result.authInfo.scopes,['mcp:read']);
});
test('invalid origin denied even with valid credentials',()=>{
  assert.equal(authorize(req({authorization:'Bearer '+key,origin:'https://bad.example'}),env).status,403);
  assert.equal(allowedOrigin('https://chatgpt.com'),true);
  assert.equal(allowedOrigin('https://chatgpt.com.bad.example'),false);
});
test('URL key disabled unless explicitly enabled',()=>{
  assert.equal(authorize(req({},'?key='+key),env).status,401);
  assert.ok(authorize(req({},'?key='+key),{...env,MCP_ALLOW_QUERY_KEY:'true'}).authInfo);
});
test('status write scope is opt-in and cannot grant high impact',()=>{
  const on={...env,MCP_ENABLE_STATUS_WRITE:'true'};
  assert.deepEqual(authorize(req({authorization:'Bearer '+key}),on).authInfo.scopes,['mcp:read','mcp:write']);
  assert.deepEqual(authorize(req({authorization:'Bearer '+key}),{...on,MCP_API_SCOPES:'mcp:read'}).authInfo.scopes,['mcp:read']);
});
