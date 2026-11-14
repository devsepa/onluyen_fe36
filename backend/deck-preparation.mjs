import {DATA_API_BASE} from '../dist/site-config.mjs';
import {isModerator} from './quality.mjs';
const UUID=/^[a-f0-9-]{36}$/;
export async function publicDeckRequest(path,env,fetcher=fetch){
 const base=env.DATA_API_BASE||DATA_API_BASE;
 const response=await fetcher(new URL('/v1/decks'+path,base),{headers:{Origin:'https://devsepa.github.io'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Object.assign(Error(response.status===404?'Bộ đề không còn trong kho chung.':'Chưa đọc được kho đề chung.'),{status:response.status});return response;
}
export class StoredDeckPreparation{
 constructor(state,env,{loadDeck,loadImage,explain,now=Date.now}={}){this.storage=state.storage;this.env=env;this.loadDeck=loadDeck;this.loadImage=loadImage;this.explain=explain;this.now=now;this.running=null;this.starting=null}
 async fetch(request){
  const path=new URL(request.url).pathname;
  try{
   if(path==='/status')return Response.json(await this.storage.get('job')||{status:'not-started'});
   if(path==='/pause'){const job=await this.storage.get('job');if(job){await this.storage.put('job',{...job,status:'paused',updatedAt:this.now()});await this.storage.deleteAlarm()}return Response.json({ok:true})}
   if(path!=='/start')return Response.json({error:'Not found'},{status:404});
   const {deckId}=await request.json();if(!UUID.test(deckId))return Response.json({error:'Bộ đề không hợp lệ.'},{status:400});
   if(this.starting)return Response.json(await this.starting);
   this.starting=this.start(deckId).finally(()=>{this.starting=null});return Response.json(await this.starting);
  }catch(error){return Response.json({error:error.message},{status:error.status||503})}
 }
 async start(deckId){
  let job=await this.storage.get('job');if(job?.status==='done'||job?.status==='running'||job?.status==='waiting')return job;
  if(!job){
   const deck=await this.loadDeck(deckId);if(!Array.isArray(deck.questions)||!deck.questions.length||deck.questions.length>500)throw Error('Bộ đề chưa có câu hợp lệ.');
   for(let offset=0;offset<deck.questions.length;offset+=25)await this.storage.put(Object.fromEntries(deck.questions.slice(offset,offset+25).map((q,i)=>['q:'+(offset+i),{id:q.id,stem:q.stem,options:q.options,answer:q.answer,extraction:q.extraction,sharedIndex:q.sharedIndex}])));
   job={deckId,title:deck.title,total:deck.questions.length,cursor:0,ready:0,reused:0,uncertain:0,conflicts:0,failed:0,retries:0,createdAt:this.now()};
  }
  job={...job,status:'running',updatedAt:this.now(),nextRunAt:this.now()+1000};await this.storage.put('job',job);await this.storage.setAlarm(job.nextRunAt);return job;
 }
 alarm(){if(this.running)return this.running;this.running=this.step().finally(()=>{this.running=null});return this.running}
 async step(){
  const job=await this.storage.get('job');if(!job||!['running','waiting'].includes(job.status))return;
  if(job.nextRunAt>this.now()){await this.storage.setAlarm(job.nextRunAt);return}
  try{
   const source=await this.storage.get('q:'+job.cursor);if(!source)throw Error('Thiếu dữ liệu câu hỏi chuẩn bị.');
   const q={id:'prepare',stem:source.stem||'Read the original question.',options:source.options,explain:true,preparation:true};
   if(source.extraction==='ocr'||!source.options.every(o=>o.text?.trim())){
    const blob=await this.loadImage(job.deckId,source.sharedIndex??job.cursor);const bytes=new Uint8Array(await blob.arrayBuffer());if(!bytes.length||bytes.length>2100000)throw Error('Ảnh câu hỏi không hợp lệ.');
    let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));q.image={mimeType:blob.type||'image/png',data:btoa(binary)};
   }
   const result=await this.explain(q),answer=result.answers[0];
   const current=await this.storage.get('job');if(current?.status==='paused')return;
   if(answer.status!=='answered')job.uncertain++;
   else if([...answer.answer].sort().join('')!==[...source.answer].sort().join(''))job.conflicts++;
   else{job.ready++;if(answer.reused)job.reused++}
   job.cursor++;job.retries=0;delete job.lastError;
  }catch(error){
   const current=await this.storage.get('job');if(current?.status==='paused')return;
   job.lastError=error.status===429?'Đang nghỉ theo hạn mức AI. Máy chủ sẽ tự tiếp tục.':error.status===404?'Bộ đề hoặc ảnh không còn truy cập được.':'Chưa chuẩn bị được câu này. Máy chủ sẽ thử lại.';
   if(error.status===429){job.status='waiting';job.nextRunAt=this.now()+Math.min(86400,Math.max(60,error.retryAfterSeconds||60))*1000;job.updatedAt=this.now();await this.storage.put('job',job);await this.storage.setAlarm(job.nextRunAt);return}
   if(error.status===404){job.status='paused';await this.storage.put('job',{...job,updatedAt:this.now()});return}
   job.retries++;if(job.retries<3){job.nextRunAt=this.now()+60000;await this.storage.put('job',{...job,status:'waiting',updatedAt:this.now()});await this.storage.setAlarm(job.nextRunAt);return}
   job.failed++;job.cursor++;job.retries=0;
  }
  job.status=job.cursor>=job.total?'done':'running';job.updatedAt=this.now();job.nextRunAt=job.status==='done'?null:this.now()+60000;
  await this.storage.put('job',job);if(job.nextRunAt)await this.storage.setAlarm(job.nextRunAt);
 }
}
const object=(env,id)=>env.DECK_PREPARATION.get(env.DECK_PREPARATION.idFromName(id));
export async function preparationCatalog(env){
 const decks=await(await publicDeckRequest('',env)).json();if(!Array.isArray(decks))throw Error('Kho đề chưa hợp lệ.');return decks.slice(0,100);
}
export async function discoverPreparation(env){
 if(env.PREPARE_PUBLIC_DECKS!=='true'||!env.DECK_PREPARATION)return;
 const decks=await preparationCatalog(env);
 for(const deck of decks){const job=await(await object(env,deck.id).fetch('https://preparation/status')).json();if(job.status==='not-started')await object(env,deck.id).fetch(new Request('https://preparation/start',{method:'POST',body:JSON.stringify({deckId:deck.id})}))}
}
export async function preparationRoute(request,env,cors){
 const wrap=response=>new Response(response.body,{status:response.status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!env.DECK_PREPARATION)return wrap(Response.json({error:'Đang chuẩn bị tính năng.'},{status:503}));
 const url=new URL(request.url),id=url.pathname.split('/')[3];
 if(request.method==='GET'&&!id){
  try{const decks=await preparationCatalog(env),jobs=await Promise.all(decks.map(async deck=>({id:deck.id,title:deck.title,total:deck.count,...await(await object(env,deck.id).fetch('https://preparation/status')).json()})));return wrap(Response.json({jobs,automatic:env.PREPARE_PUBLIC_DECKS==='true'}))}catch(error){return wrap(Response.json({error:error.status?error.message:'Chưa tải được tiến độ chuẩn bị.',code:error.status?'PREPARATION_SOURCE_'+error.status:'PREPARATION_STATUS_UNAVAILABLE'},{status:503}))}
 }
 if(!UUID.test(id||''))return wrap(Response.json({error:'Bộ đề không hợp lệ.'},{status:400}));
 if(request.method==='GET')return wrap(await object(env,id).fetch('https://preparation/status'));
 if(request.method!=='POST')return wrap(Response.json({error:'Method not allowed'},{status:405}));
 if(!await isModerator(request,env))return wrap(Response.json({error:'Chỉ tài khoản quản lý được bắt đầu hoặc dừng chuẩn bị.'},{status:403}));
 const action=url.pathname.split('/')[4];if(!['start','pause'].includes(action))return wrap(Response.json({error:'Thao tác không hợp lệ.'},{status:400}));
 return wrap(await object(env,id).fetch(new Request('https://preparation/'+action,{method:'POST',body:JSON.stringify({deckId:id})})));
}
