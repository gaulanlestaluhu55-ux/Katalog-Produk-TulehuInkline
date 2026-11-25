import { timingSafeEqual } from 'node:crypto';

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function allowedOrigin(origin) {
  return !origin || ['https://chatgpt.com', 'https://chat.openai.com'].includes(origin);
}
export function authorize(request, env = process.env) {
  if (!allowedOrigin(request.headers.get('origin'))) return { status: 403 };
  const key = env.MCP_API_KEY?.trim();
  const ownerId = env.MCP_OWNER_ID?.trim();
  const scopes = (env.MCP_API_SCOPES || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!key || key.length < 32 || !ownerId || !scopes.includes('mcp:read')) return { status: 503 };
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  // Optional legacy compatibility; disabled by default. Never log request URLs.
  const queryKey = env.MCP_ALLOW_QUERY_KEY === 'true' ? new URL(request.url).searchParams.get('key') || '' : '';
  const presented = token || queryKey;
  if (!presented || !safeEqual(presented, key)) return { status: 401 };
  const write=env.MCP_ENABLE_STATUS_WRITE==='true'&&scopes.includes('mcp:write');
  const operations=write&&env.MCP_ENABLE_OPERATIONS==='true';
  const high=operations&&env.MCP_ENABLE_FINANCE_WRITE==='true'&&scopes.includes('mcp:high-impact');
  const media=operations&&env.MCP_ENABLE_MEDIA_WRITE==='true';
  return { authInfo: { token: presented, clientId: 'tulehu-inkline-private', scopes: ['mcp:read', ...(write?['mcp:write']:[]),...(operations?['mcp:operations']:[]),...(high?['mcp:high-impact']:[]),...(media?['mcp:media']:[])], extra: { ownerId } } };
}