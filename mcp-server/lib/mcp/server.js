import { McpServer, requireScopes } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { OPERATIONS, uploadSchema, createOperationService, createMediaService } from './operations.js';
import { createReadService } from './read-service.js';

import { createStatusWriteService, REGULAR_STATUSES, BULK_STATUSES } from './status-write-service.js';

const writeScope = requireScopes('mcp:write');
const highScope = requireScopes('mcp:high-impact');
const readScope = requireScopes('mcp:read');
const annotations = { readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:false };
const uuid = z.string().uuid();
const page = {limit:z.number().int().min(1).max(50).default(20),offset:z.number().int().min(0).max(100000).default(0)};
const query = z.string().trim().min(1).max(120).optional();
const orderList = z.object({...page,query,status:z.string().max(60).optional(),paymentStatus:z.string().max(60).optional()}).strict();
const empty = z.object({}).strict();
const idSchema = z.object({id:uuid}).strict();
const range = z.enum(['1d','1m','12m']).default('1m');
export const INFO = {serverName:'tulehu-inkline',version:'0.2.0',schemaVersion:'2',mode:'read-only'};
export function createInklineMcpServer(principal, service = createReadService(), writeService = createStatusWriteService(), operationService = createOperationService(), mediaService = createMediaService()) {
  if (!principal?.ownerId) throw new Error('Authenticated owner required.');
  const server = new McpServer({name:INFO.serverName,version:INFO.version},{capabilities:{tools:{}}});
  const canWrite=Array.isArray(principal.scopes)&&principal.scopes.includes('mcp:write');
  const canOperate=canWrite&&principal.scopes.includes('mcp:operations');
  const canFinance=canOperate&&principal.scopes.includes('mcp:high-impact');
  const canMedia=canOperate&&principal.scopes.includes('mcp:media');
  function register(name, description, inputSchema, run, write=false, high=false, meta) {
    server.registerTool(name,{description,inputSchema,annotations:write?{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false}:annotations,scopeChallenge:high?highScope:write?writeScope:readScope,...(meta?{_meta:meta}:{})},async input=>{
      try {
        const data=await run(input);
        return {content:[{type:'text',text:JSON.stringify(data)}]};
      } catch(error) {
        // No upstream response bodies, headers or credentials in tool errors.
        return {isError:true,content:[{type:'text',text:error instanceof Error && /^(Backend |Unexpected backend|Expected |Order not found|Product not found|Invalid resource|Status |Invalid status)/.test(error.message)?error.message:write?'Write operation failed. Read order before retrying.':'Read operation failed.'}]};
      }
    });
  }
  register('get_mcp_info','Return MCP identity and release mode.',empty,()=>({...INFO,mode:canOperate?'operations-write':canWrite?'status-write':'read-only',financialWrite:canFinance,mediaWrite:canMedia}));
  register('get_profile','Return authenticated single-owner store profile.',empty,()=>({id:principal.ownerId,name:'Tulehu Inkline'}));
  register('list_orders','List regular orders; optional customer/product search, exact status and payment status. Use nextOffset to paginate.',orderList,service.listOrders);
  register('get_order','Get a regular order by UUID obtained from list_orders.',idSchema,({id})=>service.getOrder(id));
  register('get_order_payments','Read regular order payment history by order UUID.',idSchema,({id})=>service.getOrderPayments('orders',id));
  register('list_bulk_orders','List bulk orders; optional customer/product search and status filters.',orderList,service.listBulkOrders);
  register('get_bulk_order','Get bulk order and items by UUID.',idSchema,({id})=>service.getBulkOrder(id));
  register('get_bulk_order_payments','Read bulk order payment history by UUID.',idSchema,({id})=>service.getOrderPayments('bulk-orders',id));
  register('list_products','List and search catalog products, including inactive products unless filtered.',z.object({...page,query,active:z.boolean().optional()}).strict(),service.listProducts);
  register('get_product','Get catalog product by UUID.',idSchema,({id})=>service.getProduct(id));
  register('list_accounts','Read available finance accounts.',empty,service.listAccounts);
  register('list_transactions','Read recorded finance transactions; filter by exact account name or transaction type.',z.object({...page,account:z.string().max(100).optional(),type:z.enum(['Masuk','Keluar']).optional()}).strict(),service.listTransactions);
  register('get_dashboard','Read existing dashboard summary, using existing period semantics.',z.object({range}).strict(),({range})=>service.dashboard('summary',range,20));
  register('get_top_products','Read existing dashboard top-product metric; preserves existing aggregation semantics.',z.object({range,limit:z.number().int().min(1).max(50).default(5)}).strict(),({range,limit})=>service.dashboard('top-products',range,limit));
  register('get_finance_summary','Read existing dashboard finance summary; internal transfers excluded by backend.',z.object({range,limit:z.number().int().min(1).max(50).default(20)}).strict(),({range,limit})=>service.dashboard('finance',range,limit));
  register('get_stock_requirements','Read existing vendor stock requirements. No vendor contact action.',z.object(page).strict(),service.stock);
  register('list_vendors','List vendor identities and names.',z.object(page).strict(),service.vendors);
  const combinedInput=z.object({...page,query,kind:z.enum(['all','regular','bulk']).default('all')}).strict();
  const previewInput=z.object({
    id_produk:uuid,cuttingan:z.enum(['Reguler','Oversize']).default('Reguler'),
    tambahan_harga_per_pcs:z.number().int().min(0).max(10000000).default(0),
    discount_type:z.enum(['nominal','percent']).default('nominal'),
    discount_value:z.number().min(0).max(10000000).default(0),
    items:z.array(z.object({size:z.string().trim().min(1).max(80),warna:z.string().trim().min(1).max(80),lengan:z.string().trim().min(1).max(80),qty:z.number().int().min(1).max(10000)}).strict()).min(1).max(100)
  }).strict().refine(input=>input.discount_type!=='percent'||input.discount_value<=100,{message:'Percent discount must be <=100.'});
  register('get_business_rules','Read current backend bulk pricing rules, options and production statuses. Actual base price is per catalog product; no changes.',empty,service.businessRules);
  register('get_outstanding_payments','Read non-cancelled regular and bulk orders with outstanding balance. Observed total covers existing API records only; pagination may be incomplete.',combinedInput,service.outstanding);
  register('get_production_queue','Read active stock orders: regular Baru/Diproses and bulk Siap Produksi/Diproses. No writes.',combinedInput,service.productionQueue);
  register('preview_bulk_order','Calculate bulk order pricing using the existing backend calculator and active catalog product. No customer data, payment, order creation or persistence. Merge duplicate variants first.',previewInput,service.previewBulk);
  register('search_orders','Search regular orders by customer, product or ID.',orderList.extend({query:z.string().trim().min(1).max(120)}),service.listOrders);
  register('search_bulk_orders','Search bulk orders by customer, product or ID.',orderList.extend({query:z.string().trim().min(1).max(120)}),service.listBulkOrders);
  register('search_products','Search catalog products by name, category or ID.',z.object({...page,query:z.string().trim().min(1).max(120),active:z.boolean().optional()}).strict(),service.listProducts);
  register('get_vendor','Read vendor detail by UUID.',idSchema,({id})=>service.getVendor(id));
  register('get_account_balances','Calculate observed account ledger balances including transfers; not live bank balances and may be incomplete.',empty,service.accountBalances);
  const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
  register('get_sales_summary','Summarize non-cancelled order totals by inclusive created-date range in WIT (UTC+9), API-limited.',z.object({from:date,to:date,kind:z.enum(['all','regular','bulk']).default('all')}).strict(),service.salesSummary);
  register('get_finance_report','Read existing finance report with category, monthly, daily and recent transaction breakdown.',z.object({range,limit:z.number().int().min(1).max(50).default(50)}).strict(),({range,limit})=>service.dashboard('finance',range,limit));
  if(canOperate){
    for(const [name,op] of Object.entries(OPERATIONS)){
      if(op.high&&!canFinance)continue;
      register(name,op.description+' Explicit owner instruction required. confirm=true and a unique requestId UUID; reuse same ID and payload on retry. Read current data first.',op.schema,input=>operationService(name,input),true,!!op.high);
    }
    if(canMedia)register('upload_product_image','Upload one owner-supplied PNG/JPEG/WebP (max 8 MiB) to Cloudinary. Returns URL; does not attach to product. Requires explicit confirmation; do not overwrite on retry.',uploadSchema,mediaService,true,false,{'openai/fileParams':['file'],securitySchemes:[{type:'noauth'}]});
  }
  if(canWrite) {
    const statusInput=statuses=>z.object({id:uuid,requestId:uuid,expectedStatus:z.enum(statuses),status:z.enum(statuses)}).strict();
    register('update_order_status','Change only the production status of a regular order after explicit owner instruction. Read order first; use its exact current status as expectedStatus. Supply a unique requestId UUID for this operation and reuse it on retry. Replayed response is historical; read order for current status. No cancellation, payment, quantity or price change.',statusInput(REGULAR_STATUSES),writeService.updateRegular,true);
    register('update_bulk_order_status','Change only the production status of a bulk order after explicit owner instruction. Read order first; use its exact current status as expectedStatus. Supply a unique requestId UUID for this operation and reuse it on retry. Replayed response is historical; read order for current status. No cancellation, payment or item change.',statusInput(BULK_STATUSES),writeService.updateBulk,true);
  }
  return server;
}