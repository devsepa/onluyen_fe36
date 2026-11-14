import {explanationKey,validateOptionReasons} from './explanation-data.mjs?v=2026.11.14.32';
import {RATE_LIMIT_MESSAGE} from './ai-rate-limit.mjs?v=2026.11.14.32';
export function createExplanationQueue({load,onChange=()=>{},storage,limit=160,now=Date.now}={}){
 const cache=new Map(),states=new Map(),jobs=new Map(),queue=[],invalid=new Set();let running=null,blocked=null,disposed=false,paused=false;
 try{const saved=JSON.parse(storage?.getItem('sot-ai-cooldown-v1')||'null');if(saved?.retryAt>now()&&saved.retryAt<=now()+86400000)blocked={error:RATE_LIMIT_MESSAGE,statusCode:429,code:'AI_RATE_LIMITED',retryAt:saved.retryAt}}catch{}
 try{for(const [key,value]of JSON.parse(storage?.getItem('sot-explanation-cache-v1')||'[]').slice(-limit)){
  if(typeof key!=='string'||typeof value?.answer!=='string'||typeof value.reason!=='string'||value.reason.length>3000||!Array.isArray(value.options))continue;
  validateOptionReasons(value.options,value.options.map(o=>o.id));cache.set(key,value);
 }}catch{cache.clear()}
 const state=q=>{const key=explanationKey(q);if(cache.has(key))return {status:'ready',details:cache.get(key)};const saved=q.explanationDetails;if(!invalid.has(key)&&saved?.key===key&&saved.answer===q.answer&&typeof saved.reason==='string')try{validateOptionReasons(saved.options,saved.options.map(o=>o.id));return {status:'ready',details:saved}}catch{}return states.get(key)||{status:'idle'}};
 function emit(job,value){states.set(job.key,value);try{onChange(job.q,value)}catch{}}
 function persist(){try{while(cache.size>limit){const key=cache.keys().next().value;cache.delete(key);states.delete(key)}let entries=[...cache];while(entries.length>1&&JSON.stringify(entries).length>600000){states.delete(entries[0][0]);cache.delete(entries[0][0]);entries=entries.slice(1)}storage?.setItem('sot-explanation-cache-v1',JSON.stringify(entries))}catch{/* Cache denial must never block practice. */}}
 function drop(job){jobs.delete(job.key);states.delete(job.key);job.resolve(null)}
 async function pump(){
  if(running||disposed||paused)return;
  if(blocked){for(const job of queue.splice(0)){emit(job,{status:'error',...blocked});jobs.delete(job.key);job.resolve(null)}return}
  const job=queue.shift();if(!job)return;running=job;job.controller=new AbortController();emit(job,{status:'loading'});
  try{
   const details=await load(job.q,{signal:job.controller.signal});
   if(job.controller.signal.aborted||disposed){if(jobs.get(job.key)===job)states.delete(job.key);job.resolve(null);return}
   cache.delete(job.key);cache.set(job.key,details);persist();emit(job,{status:'ready',details});job.resolve(details);
  }catch(error){
   if(job.controller.signal.aborted){if(jobs.get(job.key)===job)states.delete(job.key);job.resolve(null)}
   else{const failure={error:error.message||'Chưa tải được giải thích AI.',statusCode:error.status||0,code:error.code,...(error.code==='AI_ANSWER_CONFLICT'&&error.comparison?{comparison:error.comparison}:{}),...(error.status===429?{retryAt:now()+Math.min(86400,Math.max(1,Number(error.retryAfterSeconds)||60))*1000}:{})};if([401,403,429].includes(error.status))blocked=failure;if(error.status===429)try{storage?.setItem('sot-ai-cooldown-v1',JSON.stringify({retryAt:failure.retryAt}))}catch{}emit(job,{status:'error',...failure});job.resolve(null)}
  }finally{if(jobs.get(job.key)===job)jobs.delete(job.key);if(!states.has(job.key))job.resolve(null);running=null;pump()}
 }
 function request(q,{retry=false,priority=false}={}){
  const embedded=state(q);if(embedded.status==='ready')return Promise.resolve(embedded.details);
  const key=explanationKey(q);if(cache.has(key))return Promise.resolve(cache.get(key));
  if(blocked?.statusCode===429&&blocked.retryAt>now()){emit({key,q},{status:'error',...blocked});return Promise.resolve(null)}
  if(retry){blocked=null;states.delete(key)}
  if(jobs.has(key)){const job=jobs.get(key);if(job.controller?.signal.aborted){jobs.delete(key);states.delete(key)}else{const index=queue.indexOf(job);if(priority&&index>0){queue.splice(index,1);queue.unshift(job)}return job.promise}}
  if(states.get(key)?.status==='error'&&!retry)return Promise.resolve(null);
  if(blocked){states.set(key,{status:'error',...blocked});return Promise.resolve(null)}
  const job={key,q:structuredClone(q),created:now()};job.promise=new Promise(resolve=>job.resolve=resolve);jobs.set(key,job);emit(job,{status:'queued'});priority?queue.unshift(job):queue.push(job);pump();return job.promise;
 }
 function retain(questions){const keys=new Set(questions.map(explanationKey));for(let i=queue.length-1;i>=0;i--)if(!keys.has(queue[i].key))drop(queue.splice(i,1)[0])}
 function cancel(){for(const job of queue.splice(0))drop(job);running?.controller.abort();if(blocked?.statusCode!==429||blocked.retryAt<=now())blocked=null}
 function resume(){if(blocked?.statusCode!==429||blocked.retryAt<=now())blocked=null;for(const [key,value]of states)if(value.status==='error'&&[401,403].includes(value.statusCode))states.delete(key)}
 return {state,request,retain,cancel,resume,setPaused(value){paused=!!value;if(!paused)pump()},invalidate(q){const key=explanationKey(q);invalid.add(key);cache.delete(key);states.delete(key);persist()},dispose(){disposed=true;cancel()}};
}
