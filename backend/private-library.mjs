import {validateLibraryQuestions,sha256,imageMime,validMediaId,MAX_IMAGE_BYTES,MAX_LIBRARY_BYTES} from '../dist/library-data.mjs';
import {GOOGLE_CLIENT_ID} from '../dist/site-config.mjs';
const json=(body,status=200)=>Response.json(body,{status});
async function getMany(storage,keys){const values=new Map();for(let i=0;i<keys.length;i+=128)for(const [key,value]of await storage.get(keys.slice(i,i+128)))values.set(key,value);return values}
const identities=new Map(),checking=new Map();
export async function verifyPrivateIdentity(authorization,clientId=GOOGLE_CLIENT_ID,fetcher=fetch){
 const key=await sha256(clientId+':'+authorization),cached=identities.get(key);if(cached?.until>Date.now())return cached.owner;if(checking.has(key))return checking.get(key);
 const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
 const promise=(async()=>{
  const infoResponse=await fetcher('https://oauth2.googleapis.com/tokeninfo',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({access_token:authorization.slice(7)}),signal:AbortSignal.timeout(10000)});
  if(!infoResponse.ok)fail(infoResponse.status<500?401:503,'Phiên Google chưa được xác thực. Hãy đăng nhập lại.');const info=await infoResponse.json();
  if(![info.aud,info.audience,info.issued_to,info.azp].includes(clientId)||!(Number(info.expires_in)>0))fail(401,'Phiên Google không thuộc ứng dụng này hoặc đã hết hạn. Hãy đăng nhập lại.');
  const identity=await fetcher('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:authorization},signal:AbortSignal.timeout(10000)});if(!identity.ok)fail(identity.status===401||identity.status===403?401:503,'Chưa xác thực được tài khoản Google.');const profile=await identity.json();
  if(typeof profile.sub!=='string'||!profile.sub||(info.sub||info.user_id)&&(info.sub||info.user_id)!==profile.sub)fail(401,'Tài khoản Google không hợp lệ.');const owner=await sha256(profile.sub);identities.set(key,{owner,until:Date.now()+Math.min(60000,Number(info.expires_in)*1000)});while(identities.size>200)identities.delete(identities.keys().next().value);return owner;
 })();checking.set(key,promise);try{return await promise}finally{checking.delete(key)}
}
async function readBytes(request,max){if(Number(request.headers.get('Content-Length'))>max)throw Error('Nội dung vượt giới hạn.');const reader=request.body?.getReader(),chunks=[];let size=0;if(reader)while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('Nội dung vượt giới hạn.')}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return bytes}
export class PrivateLibrary{
 constructor(state){this.storage=state.storage}
 async fetch(request){
  const path=new URL(request.url).pathname;
  try{
   if(path==='/status'&&request.method==='GET'){const meta=await this.storage.get('manifest');return json({revision:meta?.revision||0,updatedAt:meta?.updatedAt||null,count:meta?.count||0,bytes:await this.storage.get('usage')||0})}
   if(path==='/manifest'&&request.method==='GET'){
    const meta=await this.storage.get('manifest');if(!meta)return json({revision:0,updatedAt:null,questions:[],deleted:[]});
    const values=await this.storage.get(Array.from({length:meta.chunks},(_,i)=>'manifest:'+i)),bytes=new Uint8Array(meta.size);let offset=0;for(let i=0;i<meta.chunks;i++){const chunk=values.get('manifest:'+i);if(!chunk)throw Error('Thiếu dữ liệu thư viện; hãy thử lại.');bytes.set(chunk,offset);offset+=chunk.length}return new Response(bytes,{headers:{'Content-Type':'application/json'}});
   }
   if(path==='/manifest'&&request.method==='PUT'){
    const input=JSON.parse(new TextDecoder().decode(await readBytes(request,8*1024*1024))),questions=validateLibraryQuestions(input.questions);
    if(!Number.isInteger(input.revision)||input.revision<0||!Array.isArray(input.deleted)||input.deleted.length>20000||input.deleted.some(key=>typeof key!=='string'||key.length>2048))return json({error:'Thông tin đồng bộ không hợp lệ.'},400);
    if(questions.some(q=>(q.url||q.sharedDeck)&&!validMediaId(q.mediaId)))return json({error:'Thư viện chưa có đủ ảnh để đồng bộ độc lập.'},400);
    const references=new Set(questions.map(q=>q.mediaId).filter(Boolean));
    return this.storage.transaction(async tx=>{const old=await tx.get('manifest');if((old?.revision||0)!==input.revision)return json({error:'Thư viện đã thay đổi trên thiết bị khác. Đang cần hợp nhất lại.'},409);
     const output={revision:input.revision+1,updatedAt:Date.now(),questions,deleted:[...new Set(input.deleted)]},bytes=new TextEncoder().encode(JSON.stringify(output));if(bytes.length>8*1024*1024)return json({error:'Nội dung thư viện vượt 8 MB; hãy xuất bớt môn trước khi đồng bộ.'},413);
     for(const id of references)if(!await tx.get('media:'+id))return json({error:'Ảnh chưa tải lên đầy đủ. Hãy đồng bộ lại.'},412);
     let usage=0;for(const [key,media]of await tx.list({prefix:'media:'})){const id=key.slice(6);if(references.has(id))usage+=media.size;else{await tx.delete(key);for(let i=0;i<media.chunks;i++)await tx.delete(`image:${id}:${i}`)}}
     const chunks=Math.ceil(bytes.length/80000),values={usage,manifest:{revision:output.revision,chunks,size:bytes.length,updatedAt:output.updatedAt,count:questions.length}};for(let i=0;i<bytes.length;i+=80000)values['manifest:'+i/80000]=bytes.slice(i,i+80000);await tx.put(values);for(let i=chunks;i<(old?.chunks||0);i++)await tx.delete('manifest:'+i);return json({revision:output.revision,updatedAt:output.updatedAt});
    });
   }
   if(path==='/media/check'&&request.method==='POST'){
    const body=JSON.parse(new TextDecoder().decode(await readBytes(request,400000)));if(!Array.isArray(body.ids)||body.ids.length>5000||body.ids.some(id=>!validMediaId(id)))return json({error:'Danh sách ảnh không hợp lệ.'},400);
    const values=await getMany(this.storage,[...new Set(body.ids)].map(id=>'media:'+id));return json({missing:body.ids.filter(id=>!values.has('media:'+id))});
   }
   const match=path.match(/^\/media\/([a-f0-9]{64})$/);
   if(match&&request.method==='PUT'){
    const id=match[1],bytes=await readBytes(request,MAX_IMAGE_BYTES),mimeType=imageMime(bytes);if(await sha256(bytes)!==id)return json({error:'Mã kiểm tra ảnh không khớp.'},400);
    return this.storage.transaction(async tx=>{if(await tx.get('media:'+id))return json({ok:true});const usage=await tx.get('usage')||0;if(usage+bytes.length>MAX_LIBRARY_BYTES)return json({error:'Thư viện riêng vượt 200 MB ảnh. Hãy sao lưu và xóa bớt môn rồi thử lại.'},413);const values={usage:usage+bytes.length,['media:'+id]:{size:bytes.length,mimeType,chunks:Math.ceil(bytes.length/80000),createdAt:Date.now()}};for(let i=0;i<bytes.length;i+=80000)values[`image:${id}:${i/80000}`]=bytes.slice(i,i+80000);await tx.put(values);return json({ok:true})});
   }
   if(match&&request.method==='GET'){
    const id=match[1],meta=await this.storage.get('media:'+id);if(!meta)return json({error:'Ảnh riêng chưa được lưu.'},404);const parts=await this.storage.get(Array.from({length:meta.chunks},(_,i)=>`image:${id}:${i}`)),bytes=new Uint8Array(meta.size);for(let i=0;i<meta.chunks;i++){const chunk=parts.get(`image:${id}:${i}`);if(!chunk)throw Error('Ảnh chưa đầy đủ.');bytes.set(chunk,i*80000)}return new Response(bytes,{headers:{'Content-Type':meta.mimeType}});
   }
   return json({error:'Không tìm thấy chức năng thư viện riêng.'},404);
  }catch(error){return json({error:error instanceof SyntaxError?'Dữ liệu đồng bộ không đọc được.':error.message||'Chưa lưu được thư viện riêng.'},400)}
 }
}
export async function privateLibraryRoute(request,env,cors){
 const wrap=response=>{const headers=new Headers(response.headers);for(const [key,value]of Object.entries(cors))headers.set(key,value);headers.set('Cache-Control','private, no-store');headers.set('X-Content-Type-Options','nosniff');return new Response(response.body,{status:response.status,headers})};
 if(!env.PRIVATE_LIBRARY)return wrap(json({error:'Đồng bộ riêng tư đang được chuẩn bị. Dữ liệu trên máy vẫn được giữ.'},503));
 const path=new URL(request.url).pathname.replace(/^\/v1\/library/,'');if(!(path==='/status'&&request.method==='GET'||/^\/manifest$/.test(path)&&['GET','PUT'].includes(request.method)||path==='/media/check'&&request.method==='POST'||/^\/media\/[a-f0-9]{64}$/.test(path)&&['GET','PUT'].includes(request.method)))return wrap(json({error:'Không tìm thấy chức năng thư viện riêng.'},404));
 const authorization=request.headers.get('Authorization')||'';if(! /^Bearer [\w.~-]+$/.test(authorization)||authorization.length>4096)return wrap(json({error:'Đăng nhập Google ở ảnh đại diện để đồng bộ thư viện riêng.'},401));
 let owner;try{owner=await verifyPrivateIdentity(authorization,env.GOOGLE_CLIENT_ID||GOOGLE_CLIENT_ID)}catch(error){return wrap(json({error:error.status===401?error.message:'Chưa xác thực được tài khoản Google. Hãy thử lại.'},error.status===401?401:503))}
 const stub=env.PRIVATE_LIBRARY.get(env.PRIVATE_LIBRARY.idFromName('library:'+owner));
 try{return wrap(await stub.fetch(new Request('https://private'+path,{method:request.method,headers:{'Content-Type':request.headers.get('Content-Type')||'application/json'},...(!['GET','HEAD'].includes(request.method)?{body:request.body,duplex:'half'}:{})})))}catch{return wrap(json({error:'Chưa kết nối được thư viện riêng. Dữ liệu trên máy vẫn được giữ.'},503))}
}
