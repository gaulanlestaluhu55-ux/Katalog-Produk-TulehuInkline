const ORIGIN='https://katalog-produk-tulehu-inkline.vercel.app';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REGULAR_STATUSES=Object.freeze(['Baru','Diproses','Selesai','Diambil']);
export const BULK_STATUSES=Object.freeze(['Menunggu DP','Siap Produksi','Diproses','Selesai Produksi','Siap Diambil','Diambil']);

export function createStatusWriteService({fetchImpl=fetch,env=process.env}={}) {
  async function update(kind,{id,expectedStatus,status,requestId}) {
    if(env.MCP_ENABLE_STATUS_WRITE!=='true') throw new Error('Status writes disabled.');
    const allowed=kind==='regular'?REGULAR_STATUSES:kind==='bulk'?BULK_STATUSES:null;
    if(!allowed||!UUID.test(id)||typeof requestId!=='string'||!UUID.test(requestId)||!allowed.includes(expectedStatus)||!allowed.includes(status)||(expectedStatus==='Diambil'&&status!=='Diambil')) throw new Error('Invalid status transition or order ID.');
    const token=env.INKLINE_BACKEND_ADMIN_TOKEN?.trim();
    if(!token) throw new Error('Backend connection is not configured.');
    const path=kind==='regular'?'orders':'bulk-orders';
    const url=new URL('/api/'+path+'/'+id+'?action=mcp-status-audited',ORIGIN);
    let response;
    try {
      // Never automatically retry a write; read current status after uncertainty.
      response=await fetchImpl(url,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({expected_status:expectedStatus,status,request_id:requestId}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
    } catch {throw new Error('Status update outcome uncertain. Read order; reuse the same requestId if retrying the same operation.');}
    if(response.status===409) throw new Error('Status or request ID conflict. Read order again before requesting a new change.');
    if(response.status===503) throw new Error('Backend audit RPC or configuration unavailable. No fallback.');
    if(response.status===405) throw new Error('Backend status endpoint not deployed.');
    if(response.status===404) throw new Error('Order not found.');
    if(!response.ok) throw new Error('Status update failed or uncertain. Read order; reuse the same requestId if retrying the same operation.');
    const result=await response.json().catch(()=>null);
    const data=result?.data;
    if(result?.status!=='success'||data?.id!==id||data?.status!==status||typeof data.changed!=='boolean'||data.request_id!==requestId||typeof data.replayed!=='boolean') throw new Error('Status update outcome uncertain. Read order; reuse the same requestId if retrying the same operation.');
    return {id,status,expectedStatus,changed:data.changed,requestId,replayed:data.replayed};
  }
  return {updateRegular:input=>update('regular',input),updateBulk:input=>update('bulk',input)};
}