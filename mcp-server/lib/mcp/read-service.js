const ORIGIN = 'https://katalog-produk-tulehu-inkline.vercel.app';
const PATHS = new Set(['orders','bulk-orders','products','accounts','finance','stock','vendors','dashboard']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createReadService({ fetchImpl = fetch, env = process.env } = {}) {
  async function read(resource, { id, query = {}, previewBody } = {}) {
    if (!PATHS.has(resource) || (id && (!UUID.test(id) || !['orders','bulk-orders'].includes(resource)))) throw new Error('Invalid resource.');
    const adminToken = env.INKLINE_BACKEND_ADMIN_TOKEN?.trim();
    if (!adminToken) throw new Error('Backend connection is not configured.');
    const url = new URL('/api/' + resource + (id ? '/' + id : ''), ORIGIN);
    for (const [k,v] of Object.entries(query)) url.searchParams.set(k, String(v));
    const isPreview=previewBody!==undefined;
    if(isPreview && (resource!=='bulk-orders'||id||query.action!=='mcp-preview')) throw new Error('Invalid resource.');
    let response;
    try {
      response = await fetchImpl(url, { method:isPreview?'PATCH':'GET', headers:{ Authorization:'Bearer ' + adminToken, Accept:'application/json', ...(isPreview?{'Content-Type':'application/json'}:{}) }, ...(isPreview?{body:JSON.stringify(previewBody)}:{}), redirect:'error', cache:'no-store', signal:AbortSignal.timeout(15000) });
    } catch { throw new Error('Backend unavailable. Retry read later.'); }
    if(isPreview && response.status===405) throw new Error('Backend preview endpoint not deployed.');
    if (!response.ok) throw new Error('Backend request failed (' + response.status + ').');
    const result = await response.json().catch(() => null);
    if (!result || result.status !== 'success' || !Object.hasOwn(result,'data')) throw new Error('Unexpected backend response.');
    return result.data;
  }
  function summarizeOrder(row) {
    const {id, id_produk, nama_produk, nama_customer, kategori, size, warna, lengan, cuttingan, qty, qty_total, harga_satuan, total, nominal_dibayar, sisa, status, status_bayar, created_at} = row;
    return {id,id_produk,nama_produk,nama_customer,kategori,size,warna,lengan,cuttingan,qty,qty_total,harga_satuan,total,nominal_dibayar,sisa,status,status_bayar,created_at};
  }
  function page(rows, { limit=20, offset=0 }={}) {
    if (!Array.isArray(rows)) throw new Error('Expected list from backend.');
    return {items:rows.slice(offset,offset+limit),returned:Math.min(limit,Math.max(0,rows.length-offset)),availableFromBackend:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,completeness:'Limited to records returned by existing API; server-side pagination is not yet verified.'};
  }
  function matches(row, fields, value) {
    const q = value?.trim().toLowerCase();
    return !q || fields.some(k => String(row[k] ?? '').toLowerCase().includes(q));
  }
  async function orders(resource, input) {
    const data = await read(resource);
    if (!Array.isArray(data)) throw new Error('Expected orders list.');
    return page(data.filter(r=>matches(r,['nama_customer','nama_produk','id'],input.query) && (!input.status || r.status===input.status) && (!input.paymentStatus || r.status_bayar===input.paymentStatus)).map(summarizeOrder),input);
  }
  async function combinedOrders(input, predicate) {
    const kind=input.kind||'all';
    const resources=kind==='regular'?['orders']:kind==='bulk'?['bulk-orders']:['orders','bulk-orders'];
    const results=await Promise.all(resources.map(resource=>read(resource)));
    if(results.some(rows=>!Array.isArray(rows))) throw new Error('Expected orders list.');
    const rows=results.flatMap((records,i)=>records.filter(row=>predicate(row,resources[i])&&matches(row,['nama_customer','nama_produk','id'],input.query)).map(row=>({...summarizeOrder(row),order_type:resources[i]==='orders'?'regular':'bulk'})));
    rows.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||String(a.id).localeCompare(String(b.id)));
    return {rows,loadedCounts:Object.fromEntries(resources.map((resource,i)=>[resource,results[i].length]))};
  }
  return {
    async businessRules() {
      const rules=await read('bulk-orders',{query:{action:'mcp-rules'}});
      if(rules?.contract!=='bulk-pricing-v1') throw new Error('Backend business rules endpoint not deployed.');
      return rules;
    },
    async previewBulk(input) {
      const preview=await read('bulk-orders',{query:{action:'mcp-preview'},previewBody:input});
      if(preview?.contract!=='bulk-pricing-v1'||preview.preview!==true||preview.persisted!==false||preview.id_produk!==input.id_produk) throw new Error('Unexpected backend preview response.');
      return preview;
    },
    async outstanding(input) {
      const {rows,loadedCounts}=await combinedOrders(input,row=>row.status!=='Batal'&&row.sisa!==null&&row.sisa!==undefined&&Number.isFinite(Number(row.sisa))&&Number(row.sisa)>0);
      return {...page(rows,input),observedOutstanding:rows.reduce((sum,row)=>sum+Number(row.sisa),0),loadedCounts,definition:'Non-cancelled orders with recorded sisa > 0; totals cover returned API records only.'};
    },
    async productionQueue(input) {
      const {rows,loadedCounts}=await combinedOrders(input,(row,resource)=>(resource==='orders'?['Baru','Diproses']:['Siap Produksi','Diproses']).includes(row.status));
      return {...page(rows,input),observedPieces:rows.reduce((sum,row)=>sum+(Number(row.order_type==='bulk'?row.qty_total:row.qty)||0),0),loadedCounts,definition:'Active stock statuses only: regular Baru/Diproses; bulk Siap Produksi/Diproses.'};
    },
    listOrders: input=>orders('orders',input),
    listBulkOrders: input=>orders('bulk-orders',input),
    async getOrder(id) {
      const rows=await read('orders');
      const row=rows.find(r=>r.id===id);
      if (!row) throw new Error('Order not found in records returned by API.');
      return {...summarizeOrder(row), catatan:row.catatan, discount_type:row.discount_type, discount_value:row.discount_value};
    },
    getBulkOrder:id=>read('bulk-orders',{id}),
    getOrderPayments:(resource,id)=>read(resource,{id,query:{action:'payments'}}),
    async listProducts(input) {
      const rows=await read('products');
      return page(rows.filter(r=>matches(r,['nama','kategori','id'],input.query) && (input.active===undefined || r.aktif===input.active)),input);
    },
    async getProduct(id) {
      const rows=await read('products');
      const row=rows.find(r=>r.id===id);
      if (!row) throw new Error('Product not found in records returned by API.');
      return row;
    },
    listAccounts:()=>read('accounts'),
    async listTransactions(input) {
      const rows=await read('finance');
      return page(rows.filter(r=>(!input.account||r.akun===input.account)&&(!input.type||r.tipe===input.type)),input);
    },
    dashboard:(type,range,limit)=>read('dashboard',{query:{type,range,limit}}),
    async stock(input) { return page(await read('stock'),input); },
    async vendors(input) { return page((await read('vendors')).map(({id,nama})=>({id,nama})),input); }
  };
}