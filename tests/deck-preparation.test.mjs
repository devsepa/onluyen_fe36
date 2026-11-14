import test from 'node:test';
import assert from 'node:assert/strict';
import {StoredDeckPreparation,discoverPreparation,preparationRoute} from '../backend/deck-preparation.mjs';
const id='11111111-1111-4111-8111-111111111111';
class Memory{constructor(){this.data=new Map()}async get(k){return structuredClone(this.data.get(k))}async put(k,v){if(typeof k==='object'){for(const [key,value]of Object.entries(k))this.data.set(key,structuredClone(value))}else this.data.set(k,structuredClone(v))}async setAlarm(at){this.alarm=at}async deleteAlarm(){this.alarm=null}}
const question=n=>({id:'q'+n,stem:'Question '+n,options:[{id:'A',text:'First'},{id:'B',text:'Second'}],answer:'A',extraction:'text',sharedIndex:n});
const start=()=>new Request('https://prep/start',{method:'POST',body:JSON.stringify({deckId:id})});
test('deck preparation resumes from durable cursor, reuses explanations and never replaces the answer key',async()=>{
 let clock=0,calls=0;const storage=new Memory(),deps={now:()=>clock,loadDeck:async()=>({title:'DBI202',questions:[question(0),question(1),question(2)]}),loadImage:()=>assert.fail('Text questions need no image'),explain:async()=>{calls++;return {answers:[{status:calls===2?'uncertain':'answered',answer:calls===3?'B':'A',reused:calls===1}]}}};
 let prep=new StoredDeckPreparation({storage},{},deps);assert.equal((await prep.fetch(start())).status,200);clock=1001;await prep.alarm();let job=await storage.get('job');assert.equal(job.cursor,1);assert.equal(job.ready,1);assert.equal(job.reused,1);
 prep=new StoredDeckPreparation({storage},{},deps);clock=job.nextRunAt;await prep.alarm();job=await storage.get('job');clock=job.nextRunAt;await prep.alarm();job=await storage.get('job');
 assert.equal(job.status,'done');assert.equal(job.uncertain,1);assert.equal(job.conflicts,1);assert.equal(job.ready,1);assert.equal((await storage.get('q:2')).answer,'A');await prep.fetch(start());assert.equal(calls,3);
});
test('429 schedules a durable pause without moving the cursor; explicit pause prevents later alarms',async()=>{
 let clock=0;const storage=new Memory();const prep=new StoredDeckPreparation({storage},{},{now:()=>clock,loadDeck:async()=>({title:'JPD113',questions:[question(0)]}),explain:async()=>{throw Object.assign(Error('limited'),{status:429,retryAfterSeconds:180})}});
 await prep.fetch(start());clock=1001;await prep.alarm();const job=await storage.get('job');assert.equal(job.status,'waiting');assert.equal(job.cursor,0);assert.equal(storage.alarm,clock+180000);
 await prep.fetch(new Request('https://prep/pause',{method:'POST'}));clock+=200000;await prep.alarm();assert.equal((await storage.get('job')).status,'paused');assert.equal(storage.alarm,null);
});
test('OCR preparation uses original image bytes even when OCR text is present and never stores image data in job records',async()=>{
 let clock=0;const storage=new Memory(),prep=new StoredDeckPreparation({storage},{},{now:()=>clock,loadDeck:async()=>({title:'DBI202',questions:[{...question(0),extraction:'ocr'}]}),loadImage:async()=>new Blob(['original image'],{type:'image/png'}),explain:async q=>{assert.equal(atob(q.image.data),'original image');assert.equal(q.preparation,true);return {answers:[{status:'answered',answer:'A'}]}}});
 await prep.fetch(start());clock=1001;await prep.alarm();assert.equal((await storage.get('job')).ready,1);assert.ok(!JSON.stringify([...storage.data]).includes('original image'));
});
test('preparation control is not available to anonymous visitors',async()=>{
 const response=await preparationRoute(new Request('https://ai/v1/preparation/'+id+'/start',{method:'POST'}),{DECK_PREPARATION:{}},{});assert.equal(response.status,403);
});
test('scheduled discovery starts only missing public jobs and does not resume owner-paused jobs',async()=>{
 const old=globalThis.fetch,starts=[];try{
  globalThis.fetch=async()=>Response.json([{id,title:'DBI202'},{id:'22222222-2222-4222-8222-222222222222',title:'JPD113'}]);
  const env={PREPARE_PUBLIC_DECKS:'true',DECK_PREPARATION:{idFromName:k=>k,get:key=>({fetch:async request=>{const address=typeof request==='string'?request:request.url;if(address.endsWith('/status'))return Response.json({status:key===id?'not-started':'paused'});starts.push(key);return Response.json({ok:true})}})}};
  await discoverPreparation(env);assert.deepEqual(starts,[id]);
 }finally{globalThis.fetch=old}
});
