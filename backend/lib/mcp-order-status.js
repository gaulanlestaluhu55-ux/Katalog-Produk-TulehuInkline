// MCP status mutation must use audited RPC; no direct-update fallback.
export const MCP_REGULAR_STATUSES=Object.freeze(['Baru','Diproses','Selesai','Diambil']);
export const MCP_BULK_STATUSES=Object.freeze(['Menunggu DP','Siap Produksi','Diproses','Selesai Produksi','Siap Diambil','Diambil']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid=value=>typeof value==='string'&&UUID.test(value);
const fail=(status,code,message)=>({status,body:{status:'error',code,message}});
export async function executeAuditedOrderStatus(db,kind,id,body,env=process.env) {
  const allowed=kind==='regular'?MCP_REGULAR_STATUSES:kind==='bulk'?MCP_BULK_STATUSES:null;
  if(!allowed||!isUuid(id))return fail(400,'INVALID_ID','Invalid order ID.');
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['request_id','expected_status','status'].includes(k))||!isUuid(body.request_id))return fail(400,'INVALID_INPUT','A request UUID and status fields are required.');
  if(!allowed.includes(body.expected_status)||!allowed.includes(body.status)||(body.expected_status==='Diambil'&&body.status!=='Diambil'))return fail(400,'INVALID_STATUS','Cancellation and reopening handover are not allowed.');
  const actor=env.MCP_AUDIT_OWNER_ID?.trim();
  if(!actor||actor.length>120)return fail(503,'AUDIT_NOT_CONFIGURED','MCP audit owner not configured.');
  let result;
  try {
    result=await db.rpc('mcp_set_order_status_audited',{p_request_id:body.request_id,p_actor_id:actor,p_kind:kind,p_order_id:id,p_expected_status:body.expected_status,p_target_status:body.status});
  } catch {return fail(500,'DB_ERROR','Outcome uncertain. Read order and reuse the same request ID.');}
  if(result.error)return fail(result.error.code==='PGRST202'||result.error.code==='42883'?503:500,'DB_ERROR','Audited status RPC unavailable or outcome uncertain. No fallback. Reuse the same request ID.');
  const data=result.data;
  if(data?.ok===false){
    const errors={INVALID_INPUT:[400,'Invalid status request.'],NOT_FOUND:[404,'Order not found.'],STATUS_CONFLICT:[409,'Status changed. Read order again.'],IDEMPOTENCY_CONFLICT:[409,'Request ID already used for another operation.']};
    const entry=Object.hasOwn(errors,data.code)?errors[data.code]:null;
    return entry?fail(entry[0],data.code,entry[1]):fail(500,'DB_ERROR','Unexpected audited RPC response.');
  }
  if(data?.ok!==true||data.id!==id||data.status!==body.status||data.request_id!==body.request_id||typeof data.changed!=='boolean'||typeof data.replayed!=='boolean')return fail(500,'DB_ERROR','Outcome uncertain. Read order and reuse the same request ID.');
  return {status:200,body:{status:'success',data:{id,status:data.status,changed:data.changed,request_id:data.request_id,replayed:data.replayed}}};
}
export async function handleMcpStatus(db,kind,id,req,res) {
  try {
    const result=await executeAuditedOrderStatus(db,kind,id,req.body);
    return res.status(result.status).json(result.body);
  } catch {return res.status(500).json({status:'error',code:'DB_ERROR',message:'Outcome uncertain. Read order and reuse the same request ID.'});}
}
