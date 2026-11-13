import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudySelection,selectionKey} from '../dist/study-selection.mjs';
import {createTelemetry} from '../dist/telemetry.mjs';
import {reportSnapshot,QualityStore,qualityRoute,isModerator} from '../backend/quality.mjs';
import {StoredExplanationCache} from '../backend/explanation-cache.mjs';
import {validateResults} from '../backend/worker.mjs';
import {GOOGLE_CLIENT_ID} from '../dist/site-config.mjs';
import {createExplanationQueue} from '../dist/explanation-queue.mjs';
import {explanationKey} from '../dist/explanation-data.mjs';
class Memory{
 constructor(){this.data=new Map()}
 getItem(k){return this.data.get(k)||null}setItem(k,v){this.data.set(k,v)}
 async get(k){return structuredClone(this.data.get(k))}
 async put(k,v){for(const [key,value]of typeof k==='string'?[[k,v]]:Object.entries(k))this.data.set(key,structuredClone(value))}
 async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])this.data.delete(k)}
 async list({prefix='',reverse=false,limit=1000,end}={}){let rows=[...this.data].filter(([k])=>k.startsWith(prefix)&&(!end||k<end)).sort(([a],[b])=>a.localeCompare(b));if(reverse)rows.reverse();return new Map(rows.slice(0,limit))}
 async transaction(fn){return fn(this)}
}
const questions=Array.from({length:400},(_,i)=>({id:'q'+i,sourceId:'DBI',slide:i+1,stem:'Which clause filters groups?',options:[{id:'A',text:'WHERE'},{id:'B',text:'HAVING'}],answer:'B'}));
test('400 questions give six disjoint 60-question draws, then 40, with persistence and an explicit next round',()=>{
 const storage=new Memory();let selection=createStudySelection(storage);const ids=new Set();for(let i=0;i<7;i++){const picked=selection.select(questions,60);assert.equal(picked.length,i===6?40:60);for(const q of picked){assert.ok(!ids.has(q.id));ids.add(q.id);assert.deepEqual(q.options,questions[0].options)}selection.commit(picked);selection=createStudySelection(storage)}assert.equal(ids.size,400);assert.equal(selection.remaining(questions).length,0);selection.reset(questions);assert.equal(selection.remaining(questions).length,400);
});
test('history seeds old draws; resetting one subject preserves another and random draws remain available',()=>{
 const other={...questions[0],id:'other',sourceId:'JPD'},storage=new Memory(),s=createStudySelection(storage,[{questions:[questions[0],other]}]);assert.equal(s.remaining(questions).length,399);assert.equal(s.select([questions[0]],1,'random').length,1);s.reset(questions);assert.equal(s.remaining(questions).length,400);assert.equal(s.remaining([other]).length,0);assert.notEqual(selectionKey({...other,sourceVersion:'new'}),selectionKey(other));
});
test('separate tabs refresh shared draw progress before selecting or committing',()=>{const storage=new Memory(),first=createStudySelection(storage),second=createStudySelection(storage);first.commit([questions[0]]);assert.equal(second.remaining(questions).length,399);second.commit([questions[1]]);assert.equal(first.remaining(questions).length,398)});
test('failed selection persistence does not mutate the current round; session failure can roll back a draw',()=>{
 const storage=new Memory(),s=createStudySelection(storage),undo=s.commit([questions[0]]);assert.equal(s.remaining(questions).length,399);undo();assert.equal(s.remaining(questions).length,400);storage.setItem=()=>{throw Error('Quota')};assert.throws(()=>s.commit([questions[0]]));assert.equal(s.remaining(questions).length,400);
});
const report=()=>({type:'explanation',message:'The reason refers to another option.',question:{...questions[0],cacheKey:'a'.repeat(64),explanation:'Original explanation',token:'private',image:{data:'private-image'}}});
test('report snapshots whitelist explicit question content and reject invalid types and labels',()=>{
 const snapshot=reportSnapshot(report());assert.equal(snapshot.question.token,undefined);assert.equal(snapshot.question.image,undefined);assert.equal(snapshot.question.cacheKey,'a'.repeat(64));assert.throws(()=>reportSnapshot({...report(),type:'unknown'}));const bad=report();bad.question.options=[{id:'B',text:'wrong order'},{id:'A',text:'wrong order'}];assert.throws(()=>reportSnapshot(bad));
});
test('anonymous reports are rate limited, paged privately and resolved with optimistic concurrency',async()=>{
 const store=new QualityStore({storage:new Memory()}),submit=()=>store.fetch(new Request('https://q/report',{method:'POST',body:JSON.stringify({...report(),actor:'hash'})}));for(let i=0;i<5;i++)assert.equal((await submit()).status,200);assert.equal((await submit()).status,429);const rows=await(await store.fetch(new Request('https://q/reports'))).json();assert.equal(rows.reports.length,5);const r=rows.reports[0];const update=body=>store.fetch(new Request('https://q/report',{method:'PUT',body:JSON.stringify(body)}));assert.equal((await update({key:r.key,updatedAt:r.updatedAt,status:'resolved',note:'Checked'})).status,200);assert.equal((await update({key:r.key,updatedAt:r.updatedAt-1,status:'rejected'})).status,409);
});
test('telemetry aggregates only bounded known measurements without collecting question contents',async()=>{
 const store=new QualityStore({storage:new Memory()});await store.fetch(new Request('https://q/metrics',{method:'POST',body:JSON.stringify({actor:'hash',events:[{name:'ai_ms',ms:2000,device:'mobile',question:'DO NOT SAVE'},{name:'ai_ms',ms:4000,device:'mobile'},{name:'unknown',ms:10,device:'mobile'}]})}));const data=await(await store.fetch(new Request('https://q/metrics'))).json(),s=data.days[0].metrics['mobile:ai_ms'];assert.equal(s.count,2);assert.equal(s.total,6000);assert.equal(s.bins.reduce((a,b)=>a+b),2);assert.ok(!JSON.stringify(data).includes('DO NOT SAVE'));
 const calls=[],t=createTelemetry({base:'https://ai.example',window:{innerWidth:390,addEventListener(){},removeEventListener(){}},fetcher:async(url,init)=>{calls.push(JSON.parse(init.body));return new Response()}});t.record('ai_ms',345);t.record('unsupported',10);t.flush();t.dispose();assert.deepEqual(calls,[{events:[{name:'ai_ms',ms:345,device:'mobile'}]}]);
});
test('moderation requires the configured verified Google account and the correct OAuth audience',async()=>{
 const old=globalThis.fetch,env={MODERATOR_EMAILS:'reviewer@example.com'};let verified=true,audience=GOOGLE_CLIENT_ID,email='reviewer@example.com';globalThis.fetch=async url=>String(url).includes('tokeninfo')?Response.json({aud:audience,expires_in:3600,sub:'reviewer'}):Response.json({sub:'reviewer',email,email_verified:verified});
 try{const req=token=>new Request('https://ai.example/v1/quality/reports',{headers:{Authorization:'Bearer '+token}});assert.equal(await isModerator(req('quality-good'),env),true);email='someone-else@example.com';assert.equal(await isModerator(req('quality-other'),env),false);email='reviewer@example.com';verified=false;assert.equal(await isModerator(req('quality-unverified'),env),false);verified=true;audience='another-app';assert.equal(await isModerator(req('quality-wrong-audience'),env),false);assert.equal((await qualityRoute(new Request('https://ai.example/v1/quality/reports'),env,{})).status,403)}finally{globalThis.fetch=old}
});
test('reviewers can replace or invalidate a cached explanation, preserving choices and rejecting stale edits',async()=>{
 let calls=0;const q={...questions[0],id:'input',explain:true},storage=new Memory(),cache=new StoredExplanationCache({storage},{},async ([q])=>{calls++;return {model:'test',answers:[{id:q.id,status:'answered',answer:'B',explanation:'HAVING filters groups.',optionReasons:q.options.map(o=>({...o,reason:'Reason for '+o.id}))}]}},validateResults);
 const generate=()=>cache.fetch(new Request('https://c/',{method:'POST',body:JSON.stringify(q)}));await generate();const original=await(await cache.fetch(new Request('https://c/moderate'))).json(),a=original.result.answers[0];const edit=body=>cache.fetch(new Request('https://c/moderate',{method:'PUT',body:JSON.stringify(body)}));const body={etag:original.etag,action:'replace',answer:'B',explanation:'Reviewed and applied to grouped rows.',optionReasons:a.optionReasons};assert.equal((await edit({...body,optionReasons:[{...a.optionReasons[0],text:'Invented'},a.optionReasons[1]]})).status,400);const updated=await(await edit(body)).json();assert.equal(updated.ok,true);const reused=await(await generate()).json();assert.equal(reused.reviewed,true);assert.equal(reused.reused,true);assert.equal(reused.answers[0].explanation,body.explanation);assert.equal(calls,1);assert.equal((await edit(body)).status,409);assert.equal((await edit({etag:updated.etag,action:'invalidate'})).status,200);assert.equal((await(await cache.fetch(new Request('https://c/status'))).json()).available,false);await generate();assert.equal(calls,2);
});
test('invalidating a local explanation also prevents stale embedded details being reused',async()=>{
 const q={...questions[0]},details={answer:'B',reason:'Original reason',options:q.options.map(o=>({...o,reason:'Reason for '+o.id})),key:explanationKey(q)};q.explanationDetails=details;let calls=0;const queue=createExplanationQueue({load:async()=>{calls++;return {...details,reason:'Updated'}}});assert.equal(queue.state(q).status,'ready');queue.invalidate(q);assert.equal(queue.state(q).status,'idle');await queue.request(q);assert.equal(calls,1);assert.equal(queue.state(q).details.reason,'Updated');queue.dispose();
});
test('an in-flight generation cannot overwrite or return an obsolete explanation after a reviewer replacement',async()=>{
 const q={...questions[0],explain:true},storage=new Memory();let slow=false,release,started;const began=new Promise(resolve=>started=resolve);
 const cache=new StoredExplanationCache({storage},{},async ([q])=>{if(slow){started();await new Promise(resolve=>release=resolve)}return {model:'test',answers:[{id:q.id,status:'answered',answer:'B',explanation:'Generated reason',optionReasons:q.options.map(o=>({...o,reason:'Reason for '+o.id}))}]}},validateResults);
 const generate=()=>cache.fetch(new Request('https://c/',{method:'POST',body:JSON.stringify(q)})),edit=body=>cache.fetch(new Request('https://c/moderate',{method:'PUT',body:JSON.stringify(body)}));await generate();let entry=await(await cache.fetch(new Request('https://c/moderate'))).json();const invalidated=await(await edit({action:'invalidate',etag:entry.etag})).json();slow=true;const pending=generate();await began;
 await edit({action:'replace',etag:invalidated.etag,answer:'B',explanation:'Reviewed replacement',optionReasons:entry.result.answers[0].optionReasons});release();const result=await(await pending).json();assert.equal(result.reviewed,true);assert.equal(result.answers[0].explanation,'Reviewed replacement');assert.equal((await storage.get('result')).result.answers[0].explanation,'Reviewed replacement');
});
