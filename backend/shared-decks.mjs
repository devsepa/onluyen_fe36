const UUID=/^[a-f0-9-]{36}$/;
const json=(value,status=200)=>Response.json(value,{status});
const newUploadToken=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
function canUpload(meta,token){if(!meta.uploadToken||meta.published||Date.now()-meta.created>=86400000||! /^[a-f0-9]{64}$/.test(token))return false;let difference=0;for(let i=0;i<64;i++)difference|=meta.uploadToken.charCodeAt(i)^token.charCodeAt(i);return difference===0}
export function validateSharedQuestion(input){
 const q=input?.question,image=input?.image;
 if(!q||typeof q.stem!=='string'||q.stem.length>6000||!Array.isArray(q.options)||q.options.length<2||q.options.length>8)throw Error('Nội dung câu hỏi không hợp lệ.');
 const labels=new Set();const options=q.options.map(o=>{if(!/^[A-H]$/.test(o.id)||labels.has(o.id)||typeof o.text!=='string'||o.text.length>3000)throw Error('Lựa chọn không hợp lệ.');labels.add(o.id);return {id:o.id,text:o.text}});
 if(typeof q.answer!=='string'||! /^[A-H]{1,8}$/.test(q.answer)||new Set(q.answer).size!==q.answer.length||[...q.answer].some(a=>!labels.has(a))||(q.verified!==true&&q.answerSource!=='gemini'))throw Error('Câu hỏi chưa có đáp án hợp lệ để ôn luyện.');
 if(!image||!['image/png','image/jpeg','image/webp'].includes(image.mimeType)||typeof image.data!=='string'||image.data.length>1100000||! /^[A-Za-z0-9+/]+={0,2}$/.test(image.data)||image.data.length%4)throw Error('Ảnh slide không hợp lệ hoặc lớn hơn 800 KB.');
 const bytes=Uint8Array.from(atob(image.data),c=>c.charCodeAt(0));
 const valid=image.mimeType==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:image.mimeType==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!valid||bytes.length>819200)throw Error('Định dạng ảnh slide không hợp lệ.');
 let url='';try{const parsed=new URL(q.url);if(parsed.protocol==='https:'&&parsed.hostname==='docs.google.com'&&/^\/presentation\/d\/[\w-]+\/edit$/.test(parsed.pathname))url=parsed.href}catch{}
 return {question:{stem:q.stem,options,answer:q.answer,explanation:String(q.explanation||'').slice(0,6000),verified:q.verified===true,answerSource:['gemini','speaker-notes','manual'].includes(q.answerSource)?q.answerSource:'manual',slide:Number.isInteger(q.slide)&&q.slide>0?q.slide:1,url,sourceName:String(q.sourceName||'').slice(0,200),extraction:'ocr'},bytes,mimeType:image.mimeType};
}
// Storage is private until all images are uploaded and the owner explicitly publishes.
export class SharedDecks{
 constructor(state){this.state=state;this.storage=state.storage}
 async fetch(request){
  const path=new URL(request.url).pathname,user=request.headers.get('X-Owner')||'';
  try{
   if(path==='/catalog'&&request.method==='GET')return json([...await this.storage.list({prefix:'public:',limit:100})].map(([,v])=>v).sort((a,b)=>b.created-a.created));
   if(path==='/reserve'&&request.method==='POST')return this.storage.transaction(async tx=>{const day=new Date().toISOString().slice(0,10),key='rate:'+user,previous=await tx.get(key),count=previous?.day===day?previous.count:0;if(count>=3)return json({error:'Mỗi tài khoản đăng tối đa 3 bộ đề mỗi ngày.'},429);await tx.put(key,{day,count:count+1});return json({ok:true})});
   if(path==='/catalog'&&request.method==='POST'){const entry=await request.json();await this.storage.put('public:'+entry.id,entry);return json({ok:true})}
   if(path.startsWith('/catalog/')&&request.method==='DELETE'){await this.storage.delete('public:'+path.split('/').at(-1));return json({ok:true})}
   if(path==='/init'&&request.method==='POST'){
    const input=await request.json();if(!user||typeof input.title!=='string'||!input.title.trim()||input.title.length>160||!Number.isInteger(input.count)||input.count<1||input.count>500||input.rights!==true)return json({error:'Nhập tên bộ đề, số câu (1–500) và xác nhận quyền chia sẻ.'},400);
    if(await this.storage.get('meta'))return json({error:'Bộ đề đã tồn tại.'},409);
    const meta={id:input.id,title:input.title.trim(),count:input.count,owner:user,created:Date.now(),published:false,bytes:0,uploadToken:newUploadToken()};await this.storage.put('meta',meta);await this.storage.setAlarm(Date.now()+86400000);return json({id:meta.id,uploadToken:meta.uploadToken});
   }
   const meta=await this.storage.get('meta');if(!meta)return json({error:'Không tìm thấy bộ đề.'},404);
   if(path==='/draft'&&request.method==='GET'){
    if(user!==meta.owner)return json({error:'Bản tải dở thuộc tài khoản Google khác.'},403);
    if(!meta.published&&!meta.uploadToken){meta.uploadToken=newUploadToken();await this.storage.put('meta',meta)}
    return json({id:meta.id,title:meta.title,count:meta.count,published:meta.published,uploadToken:meta.published?null:meta.uploadToken,uploaded:[...await this.storage.list({prefix:'q:'})].map(([key])=>Number(key.slice(2))).sort((a,b)=>a-b)});
   }
   if(request.method==='PUT'&&(path==='/questions-batch'||/^\/questions\/\d+$/.test(path))){
    if(user!==meta.owner&&!canUpload(meta,request.headers.get('X-Upload-Token')||''))return json({error:'Bạn không có quyền sửa bộ đề này.'},403);
    if(meta.published)return json({error:'Bộ đề đã công khai; hãy đăng bản mới để cập nhật.'},409);
    const body=await request.json(),items=path==='/questions-batch'?body.items:[{index:Number(path.split('/').at(-1)),...body}];
    if(!Array.isArray(items)||!items.length||items.length>5)return json({error:'Mỗi lượt tải tối đa 5 ảnh.'},400);
    const seen=new Set(),validated=items.map(item=>{if(!Number.isInteger(item.index)||item.index<0||item.index>=meta.count||seen.has(item.index))throw Error('Số câu ngoài phạm vi hoặc bị trùng.');seen.add(item.index);return {index:item.index,...validateSharedQuestion(item)}});
    return this.storage.transaction(async tx=>{const current=await tx.get('meta');if(!current||current.published)return json({error:'Bộ đề đã công khai hoặc không còn tồn tại.'},409);let total=current.bytes;const values={};
     for(const {index,question,bytes,mimeType}of validated){const old=await tx.get('q:'+index);total=total-(old?.size||0)+bytes.length;values['q:'+index]={...question,size:bytes.length,mimeType,chunks:Math.ceil(bytes.length/80000)};for(let i=0;i<bytes.length;i+=80000)values[`img:${index}:${i/80000}`]=bytes.slice(i,i+80000)}
     if(total>100*1024*1024)return json({error:'Bộ đề vượt 100 MB. Hãy chia thành bộ nhỏ hơn.'},413);values.meta={...current,bytes:total};await tx.put(values);return json({ok:true,uploaded:validated.map(item=>item.index)});
    });
   }
   if(path==='/publish'&&request.method==='POST'){
    if(user!==meta.owner)return json({error:'Bạn không có quyền đăng bộ đề này.'},403);
    if((await this.storage.list({prefix:'q:'})).size!==meta.count)return json({error:'Chưa tải đủ ảnh. Bộ đề vẫn riêng tư.'},409);
    await this.storage.put('meta',{...meta,published:true,uploadToken:null});await this.storage.deleteAlarm();return json({id:meta.id,title:meta.title,count:meta.count,created:meta.created});
   }
   if(path==='/'&&request.method==='DELETE'){if(user!==meta.owner)return json({error:'Chỉ người đăng mới được gỡ bộ đề.'},403);await this.storage.deleteAll();return json({ok:true})}
   if(!meta.published)return json({error:'Bộ đề chưa được công khai.'},404);
   if(path==='/'&&request.method==='GET'){
    const entries=await this.storage.list({prefix:'q:'});return json({id:meta.id,title:meta.title,count:meta.count,created:meta.created,questions:Array.from({length:meta.count},(_,i)=>{const {size,mimeType,chunks,...q}=entries.get('q:'+i);return {...q,id:`${meta.id}-${i}`,sourceId:`shared-${meta.id}`,sourceName:meta.title,sharedDeck:meta.id,sharedIndex:i}})});
   }
   if(request.method==='GET'&&/^\/images\/\d+$/.test(path)){
    const index=Number(path.split('/').at(-1)),q=await this.storage.get('q:'+index);if(!q)return json({error:'Không tìm thấy ảnh.'},404);
    const chunks=await this.storage.get(Array.from({length:q.chunks},(_,i)=>`img:${index}:${i}`)),bytes=new Uint8Array(q.size);for(let i=0;i<q.chunks;i++)bytes.set(chunks.get(`img:${index}:${i}`),i*80000);
    return new Response(bytes,{headers:{'Content-Type':q.mimeType,'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
   }
   return json({error:'Không tìm thấy chức năng.'},404);
  }catch(error){return json({error:request.method==='PUT'?error.message:'Không xử lý được bộ đề. Hãy thử lại.'},400)}
 }
 async alarm(){const meta=await this.storage.get('meta');if(!meta?.published)await this.storage.deleteAll()}
}
export async function sharedDeckRoute(request,env,cors){
 const wrap=response=>{const headers=new Headers(response.headers);for(const [k,v]of Object.entries(cors))headers.set(k,v);headers.set('Cache-Control','no-store');return new Response(response.body,{status:response.status,headers})};
 if(!env.SHARED_DECKS)return wrap(json({error:'Kho đề đang được chuẩn bị.'},503));
 const url=new URL(request.url),match=url.pathname.match(/^\/v1\/decks(?:\/([a-f0-9-]{36})(\/.*)?)?$/);if(!match)return wrap(json({error:'Không tìm thấy bộ đề.'},404));
 if(match[1]){const path=match[2]||'/',allowed=request.method==='GET'&&(path==='/'||path==='/draft'||/^\/images\/\d+$/.test(path))||request.method==='PUT'&&(path==='/questions-batch'||/^\/questions\/\d+$/.test(path))||request.method==='POST'&&path==='/publish'||request.method==='DELETE'&&path==='/';if(!allowed)return wrap(json({error:'Không tìm thấy chức năng.'},404))}
 const authorization=request.headers.get('Authorization')||'',uploadToken=request.method==='PUT'&&/^\/(?:questions\/\d+|questions-batch)$/.test(match[2]||'')&&/^Upload [a-f0-9]{64}$/.test(authorization)?authorization.slice(7):'';
 let user='';if(!uploadToken&&(request.method!=='GET'||url.pathname.endsWith('/draft'))){
  const authorization=request.headers.get('Authorization')||'';if(!/^Bearer [\w.~-]+$/.test(authorization)||authorization.length>4096)return wrap(json({error:'Đăng nhập Google ở ảnh đại diện để đăng hoặc gỡ bộ đề.'},401));
  try{const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:authorization},signal:AbortSignal.timeout(10000)});if(!response.ok)return wrap(json({error:'Phiên Google hết hạn. Hãy đăng nhập lại.'},401));const profile=await response.json();if(!profile.sub)return wrap(json({error:'Tài khoản không hợp lệ.'},401));const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(profile.sub));user=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}catch{return wrap(json({error:'Chưa xác thực được Google.'},503))}
 }
 let body='';if(['PUT','POST'].includes(request.method)){
  const reader=request.body?.getReader();if(reader){const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>(match[2]==='/questions-batch'?6000000:1200000)){await reader.cancel();return wrap(json({error:'Nội dung tải lên quá lớn.'},413))}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}body=new TextDecoder().decode(bytes)}
 }
 const namespace=env.SHARED_DECKS,catalog=namespace.get(namespace.idFromName('catalog')),call=(stub,path,method=request.method,payload=body)=>stub.fetch('https://internal'+path,{method,headers:{'X-Owner':user,'X-Upload-Token':uploadToken,'Content-Type':'application/json'},...(!['GET','DELETE'].includes(method)?{body:payload||'{}'}:{})});
 if(!match[1]){
  if(request.method==='GET')return wrap(await call(catalog,'/catalog'));
  if(request.method!=='POST')return wrap(json({error:'Phương thức không hợp lệ.'},405));
  let input;try{input=JSON.parse(body)}catch{return wrap(json({error:'Nội dung không hợp lệ.'},400))}
  const reserved=await call(catalog,'/reserve','POST');if(!reserved.ok)return wrap(reserved);
  const id=crypto.randomUUID(),deck=namespace.get(namespace.idFromName(id));return wrap(await call(deck,'/init','POST',JSON.stringify({...input,id})));
 }
 const id=match[1];if(!UUID.test(id))return wrap(json({error:'Mã bộ đề không hợp lệ.'},400));const deck=namespace.get(namespace.idFromName(id)),path=match[2]||'/',response=await call(deck,path);
 if(response.ok&&path==='/publish'&&request.method==='POST'){const entry=await response.clone().json();await call(catalog,'/catalog','POST',JSON.stringify(entry))}
 if(response.ok&&path==='/'&&request.method==='DELETE')await call(catalog,'/catalog/'+id,'DELETE');
 return wrap(response);
}
