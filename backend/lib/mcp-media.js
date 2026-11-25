import { createHash } from 'node:crypto';
const max=8*1024*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function imageType(bytes){
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 throw Error('UNSUPPORTED_IMAGE');
}
export async function uploadProductImage(body,{env=process.env,fetchImpl=fetch}={}){
 if(env.MCP_ENABLE_MEDIA_WRITE!=='true')throw Error('MEDIA_DISABLED');
 if(!body||body.confirm!==true||typeof body.requestId!=='string'||!UUID.test(body.requestId)||Object.keys(body).some(k=>!['requestId','confirm','file'].includes(k)))throw Error('INVALID_INPUT');
 const file=body.file;
 if(!file||typeof file.file_id!=='string'||!file.file_id||typeof file.download_url!=='string'||Object.keys(file).some(k=>!['file_id','download_url','mime_type','file_name'].includes(k)))throw Error('INVALID_INPUT');
 const allowed=(env.MCP_MEDIA_ALLOWED_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 const cloud=env.CLOUDINARY_CLOUD_NAME?.trim(),key=env.CLOUDINARY_API_KEY?.trim(),secret=env.CLOUDINARY_API_SECRET?.trim();
 if(!cloud||!/^[a-z0-9_-]+$/i.test(cloud)||!key||!secret||!allowed.length)throw Error('MEDIA_NOT_CONFIGURED');
 let url;try{url=new URL(file.download_url);}catch{throw Error('INVALID_INPUT');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!allowed.includes(url.hostname.toLowerCase()))throw Error('FILE_HOST_NOT_ALLOWED');
 const source=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!source.ok||!source.body||Number(source.headers.get('content-length')||0)>max)throw Error('FILE_DOWNLOAD_FAILED');
 const reader=source.body.getReader();let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('FILE_TOO_LARGE');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 const bytes=Buffer.concat(chunks),mime=imageType(bytes);
 if(file.mime_type&&file.mime_type!==mime&&file.mime_type!=='application/octet-stream')throw Error('IMAGE_TYPE_MISMATCH');
 const publicId='inkline-mcp/'+body.requestId;
 const form=new FormData();form.set('file',new Blob([bytes],{type:mime}),'product-image.'+(mime==='image/jpeg'?'jpg':mime.split('/')[1]));form.set('public_id',publicId);form.set('overwrite','false');form.set('context','sha256='+createHash('sha256').update(bytes).digest('hex'));
 const result=await fetchImpl('https://api.cloudinary.com/v1_1/'+cloud+'/image/upload',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(key+':'+secret).toString('base64')},body:form,redirect:'error',signal:AbortSignal.timeout(12000)});
 if(!result.ok)throw Error('UPLOAD_REJECTED_OR_UNCERTAIN');
 const out=await result.json();const digest=createHash('sha256').update(bytes).digest('hex');
 if(out.public_id!==publicId||typeof out.secure_url!=='string'||!out.secure_url.startsWith('https://res.cloudinary.com/'+cloud+'/')||out.existing===true)throw Error('UPLOAD_REJECTED_OR_UNCERTAIN');
 return {requestId:body.requestId,public_id:publicId,url:out.secure_url,sha256:digest,linked:false};
}
export async function handleMcpUpload(req,res){
 try{const data=await uploadProductImage(req.body);return res.status(200).json({status:'success',data});}
 catch(e){const code=typeof e.message==='string'&&/^[A-Z_]{1,50}$/.test(e.message)?e.message:'UPLOAD_REJECTED_OR_UNCERTAIN';return res.status(code==='MEDIA_DISABLED'||code==='MEDIA_NOT_CONFIGURED'?503:400).json({status:'error',code});}
}
