import test from 'node:test';
import assert from 'node:assert/strict';
import {explanationKey,normalizeExplanation,upcomingExplanationQuestions} from '../dist/explanation-data.mjs';
import {createExplanationQueue} from '../dist/explanation-queue.mjs';
import {validateQuestions,validateResults,generateAnswers} from '../backend/worker.mjs';
import {solveBatch} from '../dist/ai.mjs';
const question=(id='q1')=>({id,sourceId:'slides',url:`https://docs.google.com/presentation/d/slides/edit#slide=id.${id}`,stem:'Which clause filters groups?',options:[{id:'A',text:'WHERE'},{id:'B',text:'HAVING'}],answer:'B'});
const result=(id='q1')=>({id,status:'answered',answer:'B',explanation:'Câu hỏi yêu cầu lọc nhóm sau GROUP BY; HAVING áp dụng điều kiện lên nhóm.',optionReasons:[{id:'A',text:'WHERE',reason:'WHERE lọc hàng trước khi nhóm.'},{id:'B',text:'HAVING',reason:'HAVING lọc nhóm sau GROUP BY.'}]});
const tick=()=>new Promise(r=>setTimeout(r,0));
test('cache identity ignores regenerated ids and selected answers, but changes with source, content or correct answer',()=>{
 const q=question();assert.equal(explanationKey(q),explanationKey({...q,id:'new-id',selected:'A'}));
 for(const change of [{answer:'A'},{stem:'Edited'},{sourceVersion:'revision2'},{sharedDeck:'other',sharedIndex:2}])assert.notEqual(explanationKey(q),explanationKey({...q,...change}));
});
test('structured explanation rejects a conflicting answer, missing option or invented labels',()=>{
 const q=question(),data=normalizeExplanation(q,result());assert.equal(data.options[0].reason,'WHERE lọc hàng trước khi nhóm.');assert.equal(q.answer,'B');
 assert.throws(()=>normalizeExplanation(q,{...result(),answer:'A'}),/khác đáp án gốc/);
 assert.throws(()=>normalizeExplanation(q,{...result(),optionReasons:result().optionReasons.slice(1)}));
 assert.throws(()=>normalizeExplanation(q,{...result(),optionReasons:[result().optionReasons[0],{id:'C',text:'Other',reason:'No'}]}));
});
test('prefetch window caps at three, skips answered questions, wraps, and is disabled for exam/completed sessions',()=>{
 const s={mode:'study',questions:Array.from({length:5},(_,i)=>question('q'+i)),current:3,answers:{q4:'B'},done:false};
 assert.deepEqual(upcomingExplanationQuestions(s).map(q=>q.id),['q3','q0','q1']);
 assert.deepEqual(upcomingExplanationQuestions({...s,mode:'exam'}),[]);assert.deepEqual(upcomingExplanationQuestions({...s,done:true}),[]);
});
test('queue shares in-flight work, persists a reusable result and limits concurrent work to one',async()=>{
 const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};let calls=0,active=0,max=0;
 const load=async q=>{calls++;max=Math.max(max,++active);await tick();active--;return normalizeExplanation(q,result(q.id))};
 const queue=createExplanationQueue({load,storage});const a=queue.request(question()),same=queue.request(question());const b=queue.request(question('q2'));
 assert.equal(a,same);await Promise.all([a,b]);assert.equal(calls,2);assert.equal(max,1);
 const reloaded=createExplanationQueue({storage,load:()=>assert.fail('cache should prevent another AI call')});assert.equal((await reloaded.request({...question(),id:'regenerated'})).answer,'B');
});
test('a failed job is not automatically retried and a quota error stops queued billable requests',async()=>{
 let calls=0,fail=true;const queue=createExplanationQueue({load:async q=>{calls++;await tick();if(fail)throw Object.assign(Error('Quota'),{status:429});return normalizeExplanation(q,result(q.id))}});
 await Promise.all([queue.request(question()),queue.request(question('q2'))]);assert.equal(calls,1);assert.equal(queue.state(question('q2')).status,'error');
 await queue.request(question());assert.equal(calls,1);fail=false;await queue.request(question(),{retry:true});assert.equal(calls,2);assert.equal(queue.state(question()).status,'ready');
});
test('cancellation drops queued work and an aborted response never enters the cache',async()=>{
 let release;const queue=createExplanationQueue({load:q=>new Promise(r=>release=()=>r(normalizeExplanation(q,result(q.id))))});
 const running=queue.request(question()),queued=queue.request(question('q2'));queue.cancel();release();assert.deepEqual(await Promise.all([running,queued]),[null,null]);assert.equal(queue.state(question()).status,'idle');
});
test('changed target window drops obsolete queued requests without losing current work',async()=>{
 let release;let calls=0;const queue=createExplanationQueue({load:async q=>{calls++;if(q.id==='q1')await new Promise(r=>release=r);return normalizeExplanation(q,result(q.id))}});
 const a=queue.request(question()),b=queue.request(question('q2'));queue.retain([question()]);assert.equal(await b,null);release();await a;assert.equal(calls,1);
});
test('storage denial and malformed cache cannot break practice',async()=>{
 const queue=createExplanationQueue({storage:{getItem:()=>'{invalid',setItem(){throw Error('Full')}},load:async q=>normalizeExplanation(q,result(q.id))});assert.equal((await queue.request(question())).answer,'B');
});
test('bounded caches evict old memory entries and cancelled foreground requests can be requested again',async()=>{
 const queue=createExplanationQueue({limit:1,load:async q=>normalizeExplanation(q,result(q.id))});await queue.request(question());await queue.request(question('q2'));assert.equal(queue.state(question()).status,'idle');
 let release,calls=0;const restarted=createExplanationQueue({load:async q=>{calls++;if(calls===1)await new Promise(r=>release=r);return normalizeExplanation(q,result(q.id))}});const old=restarted.request(question());restarted.cancel();const fresh=restarted.request(question());release();assert.equal(await old,null);assert.equal((await fresh).answer,'B');assert.equal(calls,2);
});
test('structured AI purpose is validated and the prompt requests exact choice contents and targeted reasons',async()=>{
 const questions=validateQuestions({purpose:'explanation',questions:[question()]});assert.equal(questions[0].explain,true);assert.throws(()=>validateQuestions({purpose:'anything',questions:[question()]}));
 await generateAnswers(questions,{GEMINI_API_KEY:'test-only'},async(_url,init)=>{const sent=JSON.parse(init.body);assert.ok(sent.systemInstruction.parts[0].text.includes('complete exact original choice text'));assert.ok(sent.generationConfig.responseSchema.properties.answers.items.required.includes('optionReasons'));return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({answers:[result()]})}]}}]})});
 assert.throws(()=>validateResults({answers:[{...result(),optionReasons:[]}]},questions));
});
test('client sends purpose but never the current selection or answer key; validates detailed results',async()=>{
 const data=await solveBatch('https://ai.test',[{...question(),selected:'A'}],'fake',{purpose:'explanation',fetcher:async(_url,init)=>{const body=JSON.parse(init.body);assert.equal(body.purpose,'explanation');assert.equal(body.questions[0].answer,undefined);assert.equal(body.questions[0].selected,undefined);return Response.json({model:'test',answers:[result()]})}});assert.equal(data.answers[0].optionReasons.length,2);
});
