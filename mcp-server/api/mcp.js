import { createMcpHandler } from '@modelcontextprotocol/server';
import { authorize, allowedOrigin } from '../lib/mcp/auth.js';
import { createInklineMcpServer } from '../lib/mcp/server.js';

const handler = createMcpHandler(({authInfo})=>createInklineMcpServer({ownerId:authInfo?.extra?.ownerId,scopes:authInfo?.scopes||[]}),{responseMode:'json'});
function cors(res,origin) {
  if (origin && allowedOrigin(origin)) res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','authorization, content-type, mcp-protocol-version, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers','mcp-session-id');
  res.setHeader('Cache-Control','no-store');
}
export default async function endpoint(req,res) {
  const origin=req.headers.origin;
  cors(res,origin);
  if (!allowedOrigin(origin)) return res.status(403).end();
  if (req.method==='OPTIONS') return res.status(204).end();
  if (req.method!=='POST') {res.setHeader('Allow','POST, OPTIONS');return res.status(405).end();}
  try {
    const headers=new Headers();
    for(const [k,v] of Object.entries(req.headers)) if(v!==undefined) headers.set(k,Array.isArray(v)?v.join(', '):String(v));
    // Vercel parses JSON body; convert it back into a WHATWG Request for the Content OS SDK.
    const raw=typeof req.body==='string'||Buffer.isBuffer(req.body)?req.body:JSON.stringify(req.body??{});
    if(Buffer.byteLength(raw)>262144) return res.status(413).end();
    headers.delete('content-length');
    const url=new URL(req.url,'https://mcp.tulehuinkline.my.id');
    if(url.origin!=='https://mcp.tulehuinkline.my.id') return res.status(400).end();
    const request=new Request(url,{method:'POST',headers,body:raw});
    const auth=authorize(request);
    if(!auth.authInfo) {
      if(auth.status===401) res.setHeader('WWW-Authenticate','Bearer realm="tulehu-inkline-mcp"');
      return res.status(auth.status).json({error:auth.status===503?'MCP authentication not configured.':'Unauthorized.'});
    }
    const response=await handler.fetch(request,{authInfo:auth.authInfo});
    for(const [k,v] of response.headers) if(!['content-length','transfer-encoding','connection','cache-control'].includes(k)) res.setHeader(k,v);
    return res.status(response.status).end(Buffer.from(await response.arrayBuffer()));
  } catch { return res.status(500).json({error:'MCP request failed.'}); }
}