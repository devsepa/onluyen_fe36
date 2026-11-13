import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{ExplanationCache,validateResults} from '../backend/worker.mjs';
import {StoredExplanationCache,explanationCacheKey,explainWithSharedCache} from '../backend/explanation-cache.mjs';
import {normalizeExplanation} from '../dist/explanation-data.mjs';
const question=()=>({id:'first-user',stem:'Which clause filters aggregated groups?',options:[{id:'A',text:'WHERE'},{id:'B',text:'HAVING'}],explain:true});
const answer=q=>({id:q.id,status:'answered',answer:'B',explanation:'HAVING filters groups after aggregation.',optionReasons:q.options.map(o=>({...o,reason:o.id==='B'?'Filters aggregated groups.':'Filters individual rows before aggregation.'}))});
const memory=()=>{const data=new Map();return{data,async get(k){return structuredClone(data.get(k))},async put(k,v){data.set(k,structuredClone(v))}}};
function namespace(generate){const objects=new Map(),stores=new Map();const env={GEMINI_MODEL:'test-model',EXPLANATION_CACHE:{idFromName:k=>k,get:k=>{if(!objects.has(k)){const storage=stores.get(k)||memory();stores.set(k,storage);objects.set(k,new StoredExplanationCache({storage},env,generate,validateResults))}return objects.get(k)}}};return {env,objects,stores}}
test('shared explanations persist across users, client ids and cache object restarts',async()=>{
 let calls=0;const n=namespace(async qs=>{calls++;return {answers:qs.map(answer),model:'test-model'}});
 const first=await explainWithSharedCache([question()],n.env);assert.equal(first.answers[0].reused,false);
 n.objects.clear();const next=await explainWithSharedCache([{...question(),id:'second-user'}],n.env);
 assert.equal(calls,1);assert.equal(next.answers[0].id,'second-user');assert.equal(next.answers[0].reused,true);assert.equal(next.answers[0].answer,'B');
 assert.ok(!JSON.stringify([...n.stores.values()].map(s=>[...s.data])).includes('first-user'));
});
test('keys change with question, choices and model; image copies ignore source-specific ids and placeholder text',async()=>{
 const q=question(),base=await explanationCacheKey(q);
 assert.notEqual(base,await explanationCacheKey({...q,stem:q.stem+' NOT'}));assert.notEqual(base,await explanationCacheKey({...q,options:q.options.toReversed()}));assert.notEqual(base,await explanationCacheKey(q,{GEMINI_MODEL:'new-model'}));
 const image={mimeType:'image/png',data:'AAAA'};assert.equal(await explanationCacheKey({...q,image}),await explanationCacheKey({...q,id:'other',stem:'Slide 82',image}));assert.notEqual(await explanationCacheKey({...q,image}),await explanationCacheKey({...q,image:{...image,data:'BBBB'}}));
});
test('concurrent requests share generation; uncertain results are not persisted',async()=>{
 let calls=0;const n=namespace(async qs=>{calls++;await new Promise(r=>setTimeout(r,5));return{answers:qs.map(answer),model:'test-model'}});
 await Promise.all([explainWithSharedCache([question()],n.env),explainWithSharedCache([{...question(),id:'other'}],n.env)]);assert.equal(calls,1);
 const uncertain=namespace(async qs=>({answers:qs.map(q=>({id:q.id,status:'uncertain',answer:'',explanation:'Missing context',optionReasons:[]})),model:'test-model'}));await explainWithSharedCache([question()],uncertain.env);assert.equal([...uncertain.stores.values()][0].data.size,0);
});
test('changed original choice text is rejected by server and client',()=>{
 const q=question(),result=answer(q);result.optionReasons[0].text='Invented choice';assert.throws(()=>validateResults({answers:[result]},[q]));assert.throws(()=>normalizeExplanation({...q,answer:'B'},result));
});
test('two anonymous Worker requests reuse server explanation without Google calls or persisting image/token data',async()=>{
 const old=globalThis.fetch;let modelCalls=0;const stores=new Map(),instances=new Map();
 const env={ALLOWED_ORIGINS:'https://devsepa.github.io',GEMINI_API_KEY:'synthetic-key',GEMINI_MODEL:'test-model',EXPLANATION_CACHE:{idFromName:k=>k,get:k=>{if(!instances.has(k)){const storage=memory();stores.set(k,storage);instances.set(k,new ExplanationCache({storage},env))}return instances.get(k)}}};
 const req=id=>new Request('https://ai.example/v1/answers',{method:'POST',headers:{Origin:env.ALLOWED_ORIGINS,'Content-Type':'application/json'},body:JSON.stringify({purpose:'explanation',questions:[{...question(),id}]})});
 try{globalThis.fetch=async(url,init)=>{assert.ok(!String(url).includes('googleapis.com/v1/userinfo'));modelCalls++;const q=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({answers:[answer(q)]})}]}}]})};
  const a=await worker.fetch(req('guest-one'),env);assert.equal(a.status,200);assert.equal((await a.json()).answers[0].reused,false);
  const b=await worker.fetch(req('guest-two'),env);assert.equal(b.status,200);assert.equal((await b.json()).answers[0].reused,true);assert.equal(modelCalls,1);assert.ok(!JSON.stringify([...stores.values()].map(s=>[...s.data])).includes('synthetic-key'));
 }finally{globalThis.fetch=old}
});
