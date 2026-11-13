import {verifyPrivateIdentity} from './private-library.mjs';
import {GOOGLE_CLIENT_ID} from '../dist/site-config.mjs';
import {sha256} from '../dist/library-data.mjs';
const json=(data,status=200)=>Response.json(data,{status});
const names=new Set(['image_ms','image_error','ai_ms','ai_error','shared_hit','shared_miss','local_hit','js_error','rejection']);
const allowedTypes=new Set(['answer','image','explanation','other']);
const text=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
export async function readQualityBody(request,max=48000){const reader=request.body?.getReader();let size=0;const chunks=[];if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw Error('Nội dung quá dài.')}chunks.push(value)}const bytes=new Uint8Array(size);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length}return JSON.parse(new TextDecoder().decode(bytes))}
export function reportSnapshot(input){
 if(!allowedTypes.has(input.type)||!text(input.message,2000))throw Error('Chọn loại lỗi và mô tả vấn đề.');
 const q=input.question;if(!q||typeof q.stem!=='string'||!Array.isArray(q.options)||q.options.length<2||q.options.length>8)throw Error('Câu hỏi không hợp lệ.');
 const options=q.options.map((o,i)=>{if(o.id!==String.fromCharCode(65+i)||typeof o.text!=='string')throw Error('Lựa chọn không hợp lệ.');return {id:o.id,text:text(o.text,3000)}});
 const sharedDeck=/^[a-f0-9-]{36}$/.test(q.sharedDeck||'')?q.sharedDeck:null;
 return {type:input.type,message:text(input.message,2000),question:{stem:text(q.stem,6000),options,answer:/^[A-H]{1,8}$/.test(q.answer||'')?q.answer:'',explanation:text(q.explanation,3000),slide:Number.isInteger(q.slide)?q.slide:null,...(sharedDeck&&Number.isInteger(q.sharedIndex)&&q.sharedIndex>=0&&q.sharedIndex<500?{sharedDeck,sharedIndex:q.sharedIndex}:{}),...(/^[a-f0-9]{64}$/.test(q.cacheKey||'')?{cacheKey:q.cacheKey}:{})}};
}
export class QualityStore{
 constructor(state){this.storage=state.storage}
 async fetch(request){const url=new URL(request.url),path=url.pathname;try{
  if(request.method==='POST'&&this.storage.getAlarm&&!await this.storage.getAlarm())await this.storage.setAlarm(Date.now()+86400000);
  if(path==='/report'&&request.method==='POST'){
   const input=await request.json(),snapshot=reportSnapshot(input),now=Date.now(),day=new Date(now).toISOString().slice(0,10),rateKey='rate:'+day+':'+input.actor;
   return this.storage.transaction(async tx=>{const rate=await tx.get(rateKey)||{count:0,minute:0,requests:0},minute=Math.floor(now/60000);if(rate.count>=30||rate.minute===minute&&rate.requests>=5)return json({error:'Bạn đã gửi nhiều báo lỗi. Hãy thử lại sau.'},429);const id=crypto.randomUUID(),key='report:'+String(now).padStart(13,'0')+':'+id;await tx.put({[rateKey]:{count:rate.count+1,minute,requests:rate.minute===minute?rate.requests+1:1},[key]:{id,key,...snapshot,status:'pending',createdAt:now,updatedAt:now}});return json({id,ok:true})});
  }
  if(path==='/reports'&&request.method==='GET'){const cursor=url.searchParams.get('cursor');const rows=await this.storage.list({prefix:'report:',reverse:true,limit:30,...(cursor?{end:cursor}:{})});const reports=[...rows.values()];return json({reports,cursor:reports.length===30?reports.at(-1).key:null})}
  if(path==='/report'&&request.method==='PUT'){
   const input=await request.json();if(typeof input.key!=='string'||!/^report:\d{13}:[a-f0-9-]{36}$/.test(input.key)||!['pending','resolved','rejected'].includes(input.status))return json({error:'Cập nhật không hợp lệ.'},400);
   return this.storage.transaction(async tx=>{const report=await tx.get(input.key);if(!report)return json({error:'Không tìm thấy báo lỗi.'},404);if(input.updatedAt!==report.updatedAt)return json({error:'Báo lỗi đã được người khác cập nhật. Hãy tải lại.'},409);report.status=input.status;report.reviewNote=text(input.note,2000);report.updatedAt=Math.max(Date.now(),report.updatedAt+1);await tx.put(input.key,report);return json({ok:true,report})});
  }
  if(path==='/metrics'&&request.method==='POST'){
   const input=await request.json();if(!Array.isArray(input.events)||input.events.length>30)return json({error:'Dữ liệu đo không hợp lệ.'},400);
   const day=new Date().toISOString().slice(0,10);return this.storage.transaction(async tx=>{const rateKey='metric-rate:'+day+':'+input.actor,received=await tx.get(rateKey)||0;if(received+input.events.length>3000)return json({ok:true});const key='metrics:'+day,summary=await tx.get(key)||{};for(const e of input.events){if(!names.has(e.name)||!['mobile','desktop'].includes(e.device)||!Number.isFinite(e.ms)||e.ms<0||e.ms>120000)continue;const id=e.device+':'+e.name,s=summary[id]||{count:0,total:0,bins:Array(7).fill(0)};s.count++;s.total+=e.ms;s.bins[[100,500,1000,3000,10000,30000,120000].findIndex(max=>e.ms<=max)]++;summary[id]=s}await tx.put({[key]:summary,[rateKey]:received+input.events.length});return json({ok:true})});
  }
  if(path==='/metrics'&&request.method==='GET'){const rows=await this.storage.list({prefix:'metrics:',reverse:true,limit:14});return json({days:[...rows].map(([key,metrics])=>({day:key.slice(8),metrics}))})}
  return json({error:'Không tìm thấy.'},404);
 }catch{return json({error:'Nội dung yêu cầu chưa hợp lệ.'},400)}}
 async alarm(){const today=new Date().toISOString().slice(0,10),cutoff=new Date(Date.now()-14*86400000).toISOString().slice(0,10);let more=false;for(const prefix of ['rate:','metric-rate:','metrics:']){const rows=await this.storage.list({prefix,limit:1000}),old=[...rows.keys()].filter(key=>prefix==='metrics:'?key.slice(prefix.length)<cutoff:!key.startsWith(prefix+today));for(let i=0;i<old.length;i+=100)await this.storage.delete(old.slice(i,i+100));if(rows.size===1000&&old.length)more=true}await this.storage.setAlarm(Date.now()+(more?60000:86400000))}
}
export async function isModerator(request,env){
 const auth=request.headers.get('Authorization')||'';if(!/^Bearer [\w.~-]+$/.test(auth)||auth.length>4096)return false;
 try{await verifyPrivateIdentity(auth,env.GOOGLE_CLIENT_ID||GOOGLE_CLIENT_ID);const res=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:auth},signal:AbortSignal.timeout(10000)});if(!res.ok)return false;const profile=await res.json();return profile.email_verified===true&&(env.MODERATOR_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).includes(String(profile.email||'').toLowerCase())}catch{return false}
}
export async function qualityRoute(request,env,cors){
 const wrap=res=>new Response(res.body,{status:res.status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'private, no-store'}}),url=new URL(request.url),path=url.pathname.slice('/v1/quality'.length);
 if(path==='/access'&&request.method==='GET')return wrap(json({moderator:await isModerator(request,env)}));
 const publicWrite=request.method==='POST'&&['/report','/metrics'].includes(path);
 if(!publicWrite&&!await isModerator(request,env))return wrap(json({error:'Chỉ tài khoản kiểm duyệt mới có quyền truy cập.'},403));
 if(!env.QUALITY_STORE)return wrap(json({error:'Tính năng đang được chuẩn bị.'},503));
 try{
  const input=request.method==='GET'?null:await readQualityBody(request,publicWrite&&path==='/metrics'?6000:48000);
  if(publicWrite){if(path==='/report')reportSnapshot(input);input.actor=await sha256(new Date().toISOString().slice(0,10)+':'+(request.headers.get('CF-Connecting-IP')||'unknown'))}
  const object=env.QUALITY_STORE.get(env.QUALITY_STORE.idFromName('quality'));
  return wrap(await object.fetch(new Request('https://quality'+path+url.search,{method:request.method,...(input?{body:JSON.stringify(input)}:{})})));
 }catch{return wrap(json({error:'Nội dung báo lỗi chưa hợp lệ hoặc quá dài.'},400))}
}
