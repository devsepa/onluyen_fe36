import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SharedDecks,validateSharedQuestion,sharedDeckRoute} from '../backend/shared-decks.mjs';
import {validateBank} from '../dist/banks.mjs';
import {shuffle} from '../dist/core.mjs';
const id='11111111-1111-4111-8111-111111111111';
const png=(await readFile(new URL('./fixtures/vision-smoke.png',import.meta.url))).toString('base64');
const input=()=>({question:{stem:'Slide question',options:'ABCD'.split('').map(id=>({id,text:''})),answer:'AD',explanation:'Explanation',verified:true,answerSource:'speaker-notes',slide:5,url:'https://docs.google.com/presentation/d/example/edit#slide=id.s5',token:'private',email:'private@example.com'},image:{mimeType:'image/png',data:png}});
class Memory{
 constructor(){this.data=new Map()}
 async get(key){return Array.isArray(key)?new Map(key.filter(k=>this.data.has(k)).map(k=>[k,structuredClone(this.data.get(k))])):structuredClone(this.data.get(key))}
 async put(key,value){for(const [k,v]of typeof key==='string'?[[key,value]]:Object.entries(key))this.data.set(k,structuredClone(v))}
 async list({prefix='',limit=Infinity}={}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).slice(0,limit))}
 async delete(key){this.data.delete(key)}async deleteAll(){this.data.clear()}async setAlarm(){}async deleteAlarm(){}async transaction(fn){return fn(this)}
}
const request=(path,method='GET',body,user='owner')=>new Request('https://internal'+path,{method,headers:{'X-Owner':user},...(!['GET','DELETE'].includes(method)?{body:JSON.stringify(body)}:{})});
test('shared decks remain private until complete; publish once, read anonymously, preserve labels and delete by owner',async()=>{
 const state={storage:new Memory()},deck=new SharedDecks(state);const call=(...args)=>deck.fetch(request(...args));
 assert.equal((await call('/init','POST',{id,title:'DBI202',count:2,rights:false})).status,400);
 assert.equal((await call('/init','POST',{id,title:'DBI202',count:2,rights:true})).status,200);
 assert.deepEqual((await(await call('/draft')).json()).uploaded,[]);assert.equal((await call('/draft','GET',undefined,'other')).status,403);
 assert.equal((await call('/')).status,404);assert.equal((await call('/images/0')).status,404);assert.equal((await call('/publish','POST',{})).status,409);
 assert.equal((await call('/questions/0','PUT',input(),'other')).status,403);
 assert.equal((await call('/questions/0','PUT',input())).status,200);assert.equal((await call('/publish','POST',{})).status,409);
 assert.deepEqual((await(await call('/draft')).json()).uploaded,[0]);
 assert.equal((await call('/questions/1','PUT',input())).status,200);assert.equal((await call('/publish','POST',{})).status,200);
 const shared=await(await call('/','GET',undefined,'')).json();assert.equal(shared.questions.length,2);assert.equal(shared.owner,undefined);assert.equal(shared.questions[0].email,undefined);assert.equal(shared.questions[0].token,undefined);assert.equal(shared.questions[0].answer,'AD');assert.deepEqual(shared.questions[0].options.map(o=>o.id),['A','B','C','D']);
 const restored=validateBank({format:'slide-on-thi/v1',questions:shared.questions});assert.equal(restored[0].sharedDeck,id);assert.equal(restored[0].sharedIndex,0);
 const image=await call('/images/0','GET',undefined,'');assert.equal(image.headers.get('Content-Type'),'image/png');assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'),png);
 assert.equal((await call('/questions/0','PUT',input())).status,409);assert.equal((await call('/','DELETE',undefined,'other')).status,403);assert.equal((await call('/','DELETE')).status,200);assert.equal((await call('/images/0')).status,404);
});
test('shared upload rejects executable images, invalid answer sets and duplicates without persisting account data',()=>{
 const valid=validateSharedQuestion(input());assert.equal(valid.question.token,undefined);assert.equal(valid.question.email,undefined);
 for(const patch of [{image:{mimeType:'image/svg+xml',data:png}},{image:{mimeType:'image/png',data:'aGVsbG8='}},{question:{...input().question,answer:'AE'}},{question:{...input().question,options:[{id:'A',text:''},{id:'A',text:''}]}}])assert.throws(()=>validateSharedQuestion({...input(),...patch}));
});
test('draft expiry removes unpublished images; creation rate is bounded; anonymous clients cannot publish',async()=>{
 const state={storage:new Memory()},deck=new SharedDecks(state);await deck.fetch(request('/init','POST',{id,title:'Draft',count:1,rights:true}));await deck.fetch(request('/questions/0','PUT',input()));await deck.alarm();assert.equal(state.storage.data.size,0);
 const catalog=new SharedDecks({storage:new Memory()});for(let i=0;i<3;i++)assert.equal((await catalog.fetch(request('/reserve','POST',{}))).status,200);assert.equal((await catalog.fetch(request('/reserve','POST',{}))).status,429);
 const response=await sharedDeckRoute(new Request('https://worker/v1/decks',{method:'POST',body:'{}'}),{SHARED_DECKS:{}},{});assert.equal(response.status,401);
});
test('randomization copies only question order, never answer positions',()=>{
 const questions=Array.from({length:20},(_,i)=>({id:i,options:'ABCD'.split('')})),original=structuredClone(questions);const randomized=shuffle(questions);assert.deepEqual(questions,original);assert.deepEqual([...randomized].sort((a,b)=>a.id-b.id),original);for(const q of randomized)assert.deepEqual(q.options,['A','B','C','D']);
});
