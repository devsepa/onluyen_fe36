import test from 'node:test';
import assert from 'node:assert/strict';
import {StoredAIWorkQueue} from '../backend/ai-work-queue.mjs';
import {throughWorkQueue} from '../backend/ai-work-queue.mjs';
import {StoredExplanationCache,explainWithSharedCache} from '../backend/explanation-cache.mjs';
import {validateResults} from '../backend/worker.mjs';
class Memory{constructor(){this.data=new Map()}async get(key){return structuredClone(this.data.get(key))}async put(key,value){this.data.set(key,structuredClone(value))}}
const request=(id,background=false)=>new Request('https://queue/generate',{method:'POST',body:JSON.stringify({background,questions:[{id,stem:'private input '+id,options:[],explain:true}]})});
test('global queue serializes users, spaces actual calls and stores only scheduling metadata',async()=>{
 const storage=new Memory();let clock=100000,calls=0,active=0,maxActive=0,release;const starts=[];
 const queue=new StoredAIWorkQueue({storage},{},async qs=>{calls++;active++;maxActive=Math.max(active,maxActive);starts.push(clock);if(calls===1)await new Promise(r=>release=r);active--;return {answers:qs.map(q=>({id:q.id}))}},{now:()=>clock,sleep:async ms=>{clock+=ms}});
 const a=queue.fetch(request('one'));while(!release)await new Promise(r=>setImmediate(r));const b=queue.fetch(request('two'));release();const responses=await Promise.all([a,b]);
 assert.deepEqual(responses.map(r=>r.status),[200,200]);assert.equal(maxActive,1);assert.ok(starts[1]-starts[0]>=15000);assert.equal((await storage.get('schedule')).used,2);assert.ok(!JSON.stringify([...storage.data]).includes('private input'));
});
test('a provider limit blocks queued work and survives Durable Object restart',async()=>{
 const storage=new Memory();let clock=100000,calls=0;const generate=async()=>{calls++;throw Object.assign(Error('limited'),{status:429,retryAfterSeconds:120})};
 const options={now:()=>clock,sleep:async ms=>{clock+=ms}},queue=new StoredAIWorkQueue({storage},{},generate,options);
 const [a,b]=await Promise.all([queue.fetch(request('one')),queue.fetch(request('two'))]);assert.equal(a.status,429);assert.equal(b.status,429);assert.equal(calls,1);
 const reloaded=new StoredAIWorkQueue({storage},{},generate,options);const retry=await reloaded.fetch(request('three'));assert.equal(retry.status,429);assert.equal(calls,1);assert.equal((await retry.json()).retryAfterSeconds,120);
});
test('background preparation yields to active study requests and daily budget is enforced before generation',async()=>{
 const storage=new Memory();let clock=100000,calls=0,release;
 const queue=new StoredAIWorkQueue({storage},{GLOBAL_DAILY_QUESTIONS:'1'},async()=>{calls++;await new Promise(r=>release=r);return {answers:[]}},{now:()=>clock,sleep:async ms=>{clock+=ms}});
 const first=queue.fetch(request('one'));while(!release)await new Promise(r=>setImmediate(r));assert.equal((await queue.fetch(request('background',true))).status,429);const second=queue.fetch(request('two'));release();assert.equal((await first).status,200);assert.equal((await second).status,429);assert.equal(calls,1);
});
test('a shared cache hit bypasses the global work queue even while fresh generation is limited',async()=>{
 const storage=new Memory(),env={},objects=new Map();let generated=0,scheduled=0,clock=100000;
 const queue=new StoredAIWorkQueue({storage},{},async questions=>{generated++;return {model:'test',answers:questions.map(q=>({id:q.id,status:'answered',answer:'A',explanation:'Five is the exact sum.',tip:'Add the two original numbers.',optionReasons:q.options.map(o=>({...o,reason:o.id==='A'?'Exact sum.':'Not the sum.'}))}))}},{now:()=>clock,sleep:async ms=>{clock+=ms}});
 env.AI_WORK_QUEUE={idFromName:k=>k,get:()=>({fetch:request=>{scheduled++;return queue.fetch(request)}})};
 env.EXPLANATION_CACHE={idFromName:k=>k,get:k=>{if(!objects.has(k))objects.set(k,new StoredExplanationCache({storage:new Memory()},env,(qs,e)=>throughWorkQueue(qs,e),validateResults));return objects.get(k)}};
 const question={id:'first',stem:'2 + 3?',options:[{id:'A',text:'5'},{id:'B',text:'6'}],explain:true};
 await explainWithSharedCache([question],env);queue.schedule.cooldownUntil=clock+120000;
 const reused=await explainWithSharedCache([{...question,id:'another-user'}],env);assert.equal(reused.answers[0].reused,true);assert.equal(scheduled,1);assert.equal(generated,1);
});
