export class WorkQueueError extends Error{
 constructor(status,message,retryAfterSeconds=60){super(message);this.status=status;this.retryAfterSeconds=retryAfterSeconds;this.code=status===429?'AI_RATE_LIMITED':'AI_QUEUE_BUSY'}
}
const number=(value,fallback)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):fallback;
export class StoredAIWorkQueue{
 constructor(state,env,generate,{now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  this.storage=state.storage;this.env=env;this.generate=generate;this.now=now;this.sleep=sleep;this.pending=[];this.running=false;
  this.ready=this.storage.get('schedule').then(value=>{this.schedule=value||{nextAt:0,cooldownUntil:0,failures:0,day:'',used:0}});
 }
 async fetch(request){
  try{
   await this.ready;
   if(new URL(request.url).pathname==='/status')return Response.json({pending:this.pending.length,running:this.running,nextAt:this.schedule.nextAt,cooldownUntil:this.schedule.cooldownUntil});
   const input=await request.json();if(!Array.isArray(input.questions)||input.questions.length<1||input.questions.length>5)return Response.json({error:'Invalid work request'},{status:400});
   if(this.schedule.cooldownUntil>this.now())throw new WorkQueueError(429,'AI đang nghỉ theo hạn mức chung.',Math.ceil((this.schedule.cooldownUntil-this.now())/1000));
   if(this.pending.length>=4||input.background&&(this.running||this.pending.length))throw new WorkQueueError(429,'Đang ưu tiên câu hỏi của người làm bài. Sẽ chuẩn bị tiếp sau.',60);
   return await new Promise(resolve=>{this.pending.push({input,resolve,createdAt:this.now()});this.pump()});
  }catch(error){return this.failure(error)}
 }
 failure(error){const status=error.status||503,retryAfterSeconds=Math.ceil(number(error.retryAfterSeconds,60));return Response.json({error:error.status?error.message:'Hàng đợi AI tạm chưa sẵn sàng.',code:error.code||'AI_QUEUE_BUSY',retryAfterSeconds},{status,headers:{'Retry-After':String(retryAfterSeconds)}})}
 async pump(){
  if(this.running)return;this.running=true;
  try{while(this.pending.length){
   const index=this.pending.findIndex(job=>!job.input.background),job=this.pending.splice(index<0?0:index,1)[0];
   try{
    await this.ready;
    let now=this.now();if(this.schedule.cooldownUntil>now)throw new WorkQueueError(429,'AI đang nghỉ theo hạn mức chung.',Math.ceil((this.schedule.cooldownUntil-now)/1000));
    const wait=Math.max(0,this.schedule.nextAt-now);
    if(wait>30000||now-job.createdAt>30000)throw new WorkQueueError(429,'AI đang xếp hàng xử lý. Bạn có thể làm tiếp rồi thử lại.',Math.max(1,Math.ceil(wait/1000)));
    if(wait)await this.sleep(wait);
    now=this.now();const day=new Date(now).toISOString().slice(0,10);if(this.schedule.day!==day){this.schedule.day=day;this.schedule.used=0}
    if(this.schedule.used+job.input.questions.length>number(this.env.GLOBAL_DAILY_QUESTIONS,1000)){
     this.schedule.cooldownUntil=Date.parse(day+'T00:00:00Z')+86402000;await this.storage.put('schedule',this.schedule);throw new WorkQueueError(429,'Đã dùng hết lượt AI trong ngày.',Math.ceil((this.schedule.cooldownUntil-now)/1000));
    }
    const vision=job.input.questions.some(q=>q.image),spacing=vision?number(this.env.AI_IMAGE_INTERVAL_MS,60000):number(this.env.AI_TEXT_INTERVAL_MS,15000);
    this.schedule.nextAt=now+spacing;this.schedule.used+=job.input.questions.length;await this.storage.put('schedule',this.schedule);
    try{
     const result=await this.generate(job.input.questions,this.env);this.schedule.failures=0;this.schedule.cooldownUntil=0;await this.storage.put('schedule',this.schedule);job.resolve(Response.json(result));
    }catch(error){
     if(error.status===429){this.schedule.failures++;const delay=Math.max(number(error.retryAfterSeconds,60),Math.min(3600,60*2**Math.min(6,this.schedule.failures-1)));this.schedule.cooldownUntil=this.now()+delay*1000;await this.storage.put('schedule',this.schedule);error.retryAfterSeconds=delay}
     throw error;
    }
   }catch(error){job.resolve(this.failure(error))}
  }}finally{this.running=false}
 }
}
export async function throughWorkQueue(questions,env,generate,{background=false}={}){
 if(!env.AI_WORK_QUEUE)return generate(questions,env);
 const response=await env.AI_WORK_QUEUE.get(env.AI_WORK_QUEUE.idFromName('global-v1')).fetch(new Request('https://ai-work/generate',{method:'POST',body:JSON.stringify({questions,background})}));
 const data=await response.json();if(!response.ok)throw new WorkQueueError(response.status,data.error,data.retryAfterSeconds);return data;
}
