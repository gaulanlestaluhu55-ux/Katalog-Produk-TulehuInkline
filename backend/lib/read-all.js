// Count-checked PostgREST pagination. Each query factory MUST select its unique key
// and request count:'exact'. Existing sort is preserved; unique key is a tie breaker.
export const PAGED_READ_CONTRACT='paged-v1';
export async function readAllRows(makeQuery,{key='id',pageSize=500,maxRows=50000}={}){
 const fail=()=>({data:null,error:{code:'MCP_READ_INCOMPLETE',message:'Data berubah atau pagination belum lengkap. Ulangi pembacaan.'}});
 if(!Number.isInteger(pageSize)||pageSize<1||!Number.isInteger(maxRows)||maxRows<1)return fail();
 const rows=[],seen=new Set();let expected;
 try{
  do{
   const result=await makeQuery().order(key,{ascending:true}).range(rows.length,rows.length+pageSize-1);
   if(result.error)return {data:null,error:result.error};
   const {data,count}=result;
   if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||count>maxRows)return fail();
   if(expected===undefined)expected=count;
   if(count!==expected||data.length>pageSize||rows.length+data.length>expected||(!data.length&&rows.length<expected))return fail();
   for(const row of data){
    const k=row?.[key];
    if(typeof k!=='string'||!k||seen.has(k))return fail();
    seen.add(k);rows.push(row);
   }
  }while(rows.length<expected);
  return {data:rows,error:null,count:expected};
 }catch{return fail();}
}
export function markPagedRead(res){res.setHeader('X-Inkline-Read-Contract',PAGED_READ_CONTRACT);}
