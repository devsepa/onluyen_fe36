import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{validateQuestions,validateResults,generateAnswers,generateWithFallback,AIQuota} from '../backend/worker.mjs';
import {applyAiResults,solveBatch,readyForPractice} from '../dist/ai.mjs';
const q=()=>({id:'q1',sourceId:'slide',url:'https://docs.google.com/presentation/d/slide/edit#slide=id.s1',stem:'Which clause filters groups?',options:[{id:'A',text:'WHERE'},{id:'B',text:'HAVING'}],answer:'',verified:false});
const answered=()=>({id:'q1',status:'answered',answer:'B',explanation:'HAVING lọc các nhóm.'});
test('batch validation limits spend and strips identity/source fields from model input',()=>{
 const result=validateQuestions({questions:[{...q(),token:'private'}]});assert.equal(result[0].token,undefined);assert.equal(result[0].url,undefined);
 assert.throws(()=>validateQuestions({questions:Array.from({length:6},q)}));assert.throws(()=>validateQuestions({questions:[q(),q()]}));
 assert.throws(()=>validateQuestions({questions:[{...q(),options:[{id:'A',text:'1'},{id:'A',text:'2'}]}]}));
});
test('rejects unknown ids, invalid options, duplicates and missing model results',()=>{
 assert.deepEqual(validateResults({answers:[answered()]},[q()]),[answered()]);
 for(const answers of [[],[{...answered(),id:'other'}],[{...answered(),answer:'C'}],[{...answered(),status:'uncertain'}]])assert.throws(()=>validateResults({answers},[q()]));
 assert.throws(()=>validateResults({answers:[answered(),answered()]},[q(),{...q(),id:'q2'}]));
});
test('applies proposals without confirming or overwriting source answers and discards stale edits',()=>{
 const bank=[q()],submitted=structuredClone(bank);assert.deepEqual(applyAiResults(bank,submitted,[answered()],'test-model'),{applied:1,uncertain:0});
 assert.equal(bank[0].answer,'B');assert.equal(bank[0].verified,false);assert.equal(bank[0].answerSource,'gemini');
 assert.equal(readyForPractice(bank[0]),true);assert.equal(readyForPractice(q()),false);
 bank[0].answer='A';applyAiResults(bank,submitted,[answered()],'x');assert.equal(bank[0].answer,'A');
 const edited=[q()];edited[0].stem='Changed';assert.equal(applyAiResults(edited,submitted,[answered()],'x').applied,0);
 const uncertain=[q()];applyAiResults(uncertain,submitted,[{id:'q1',status:'uncertain',answer:'',explanation:'OCR unclear'}],'x');assert.equal(uncertain[0].answer,'');assert.equal(uncertain[0].aiStatus,'uncertain');
});
test('uses a verified fallback once for upstream overload but not quota or credentials',async()=>{
 const env={GEMINI_MODEL:'gemini-3.8-flash',GEMINI_FALLBACK_MODEL:'gemini-3.5-flash-lite',GEMINI_API_KEY:'private'};let calls=[];
 const result=await generateWithFallback([q()],env,async url=>{calls.push(url);return calls.length===1?Response.json({}, {status:503}):Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({answers:[answered()]})}]}}]})});
 assert.equal(result.model,env.GEMINI_FALLBACK_MODEL);assert.equal(calls.length,2);assert.equal(result.answers[0].answer,'B');
 for(const status of [401,429]){let count=0;await assert.rejects(()=>generateWithFallback([q()],env,async()=>{count++;return Response.json({}, {status})}));assert.equal(count,1)}
});
test('Gemini request uses server-only key, structured schema and safe model validation',async()=>{
 const results=await generateAnswers([q()],{GEMINI_API_KEY:'private-test',GEMINI_MODEL:'gemini-2.5-flash'},async(url,init)=>{
  assert.ok(!url.includes('private-test'));assert.equal(init.headers['x-goog-api-key'],'private-test');
  const body=JSON.parse(init.body);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.ok(body.systemInstruction.parts[0].text.includes('untrusted DATA'));
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({answers:[answered()]})}]}}]});
 });assert.equal(results[0].answer,'B');
 await assert.rejects(()=>generateAnswers([q()],{GEMINI_MODEL:'../bad'}));
 await assert.rejects(()=>generateAnswers([q()],{},async()=>Response.json({}, {status:429})),/hạn mức/);
 await assert.rejects(()=>generateAnswers([q()],{},async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS'}]})),/đầy đủ/);
});
test('distinguishes overload, quota, permission, missing model and request errors without leaking upstream text',async()=>{
 for(const [status,expected] of [[503,'quá tải tạm thời (503)'],[429,'hạn mức'],[403,'quyền truy cập'],[404,'Model Gemini'],[400,'từ chối nội dung yêu cầu']]){
  await assert.rejects(()=>generateAnswers([q()],{GEMINI_API_KEY:'private-test'},async()=>Response.json({error:{message:'private-test must not reach the client'}},{status})),error=>error.message.includes(expected)&&!error.message.includes('private-test'));
 }
});
test('public Worker rejects foreign origins and missing config; same-origin guests can request AI',async()=>{
 const env={ALLOWED_ORIGINS:'https://devsepa.github.io',GEMINI_API_KEY:'fake',AI_QUOTA:{}};
 const request=(origin,headers={})=>new Request('https://ai.example/v1/answers',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify({questions:[q()]})});
 assert.equal((await worker.fetch(request('https://other.example'),env)).status,403);
 const original=globalThis.fetch;let modelCalls=0;
 try{
  globalThis.fetch=async()=>{modelCalls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({answers:[answered()]})}]}}]})};
  assert.equal((await worker.fetch(request('https://devsepa.github.io'),env)).status,200);
  assert.equal(modelCalls,1);
 }finally{globalThis.fetch=original}
 assert.equal((await worker.fetch(request('https://devsepa.github.io'),{ALLOWED_ORIGINS:env.ALLOWED_ORIGINS})).status,503);
 const preflight=await worker.fetch(new Request('https://ai.example/v1/answers',{method:'OPTIONS',headers:{Origin:'https://devsepa.github.io'}}),env);assert.equal(preflight.status,204);
});
test('Worker uses Google identity when valid and falls back to guest access; keys remain private',async()=>{
 const old=globalThis.fetch;let quota=0,model=0;
 const env={ALLOWED_ORIGINS:'https://devsepa.github.io',GEMINI_API_KEY:'never-return-this',AI_QUOTA:{idFromName:n=>n,get:()=>({fetch:async()=>{quota++;return Response.json({ok:true})}})}};
 const req=()=>new Request('https://ai.example/v1/answers',{method:'POST',headers:{Origin:env.ALLOWED_ORIGINS,Authorization:'Bearer fake-google','Content-Type':'application/json'},body:JSON.stringify({questions:[q()]})});
 try{
  globalThis.fetch=async url=>String(url).includes('userinfo')?Response.json({sub:'user-123'}):(model++,Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({answers:[answered()]})}]}}]}));
  const r=await worker.fetch(req(),env);assert.equal(r.status,200);assert.equal(quota,1);assert.equal(model,1);assert.ok(!(await r.text()).includes(env.GEMINI_API_KEY));
  globalThis.fetch=async url=>String(url).includes('userinfo')?Response.json({}, {status:401}):(model++,Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({answers:[answered()]})}]}}]}));
  const guest=await worker.fetch(req(),env);assert.equal(guest.status,200);assert.equal(model,2);assert.equal(quota,2);assert.ok(!(await guest.text()).includes(env.GEMINI_API_KEY));
 }finally{globalThis.fetch=old}
});
test('durable quota enforces global and per-user ceilings across requests',async()=>{
 const map=new Map(),storage={get:async k=>map.get(k),put:async values=>Object.entries(values).forEach(([k,v])=>map.set(k,v)),transaction:async fn=>fn(storage),getAlarm:async()=>1};
 const quota=new AIQuota({storage},{USER_DAILY_QUESTIONS:'5',GLOBAL_DAILY_QUESTIONS:'6'});
 const reserve=(user,count)=>quota.fetch(new Request('https://quota',{method:'POST',body:JSON.stringify({user,count})}));
 assert.equal((await reserve('u1',5)).status,200);assert.equal((await reserve('u1',1)).status,429);assert.equal((await reserve('u2',2)).status,429);assert.equal((await reserve('u2',1)).status,200);
 assert.ok(!JSON.stringify([...map]).includes('stem'));
});
test('client sends only question content and rejects malformed results',async()=>{
 const result=await solveBatch('https://ai.example',[q()],'google-token',{fetcher:async(url,init)=>{assert.equal(url.pathname,'/v1/answers');assert.equal(JSON.parse(init.body).questions[0].sourceId,undefined);return Response.json({answers:[answered()],model:'test'})}});assert.equal(result.answers[0].answer,'B');
 await assert.rejects(()=>solveBatch('https://ai.example',[q()],'x',{fetcher:async()=>Response.json({answers:[],model:'x'})}));
 await assert.rejects(()=>solveBatch('http://public.example',[q()],'x'));
});
