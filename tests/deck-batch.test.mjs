import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SharedDecks,sharedDeckRoute} from '../backend/shared-decks.mjs';
const png=readFileSync(new URL('./fixtures/vision-smoke.png',import.meta.url)).toString('base64'),id='11111111-1111-4111-8111-111111111111',input=index=>({index,question:{stem:'Question',options:[{id:'A',text:''},{id:'B',text:''}],answer:'A',verified:true,slide:index+1},image:{mimeType:'image/png',data:png}});
class Storage{
 constructor(){this.data=new Map()}async get(key){return Array.isArray(key)?new Map(key.map(k=>[k,this.data.get(k)])):this.data.get(key)}async put(key,value){for(const [k,v]of typeof key==='string'?[[key,value]]:Object.entries(key))this.data.set(k,structuredClone(v))}async list({prefix=''}={}){return new Map([...this.data].filter(([key])=>key.startsWith(prefix)))}async transaction(fn){return fn(this)}async setAlarm(){}async deleteAlarm(){}async deleteAll(){this.data.clear()}async delete(key){this.data.delete(key)}
}
const request=(path,method='GET',body,owner='',uploadToken='')=>new Request('https://internal'+path,{method,headers:{'X-Owner':owner,'X-Upload-Token':uploadToken},...(!['GET','DELETE'].includes(method)?{body:JSON.stringify(body)}:{})});
test('one scoped upload capability writes a bounded batch but cannot publish or survive publication',async()=>{
 const state={storage:new Storage()},deck=new SharedDecks(state),init=await(await deck.fetch(request('/init','POST',{id,title:'Batch',count:2,rights:true},'owner'))).json();assert.match(init.uploadToken,/^[a-f0-9]{64}$/);
 assert.equal((await deck.fetch(request('/questions-batch','PUT',{items:[input(0),input(1)]},'','a'.repeat(64)))).status,403);
 assert.equal((await deck.fetch(request('/questions-batch','PUT',{items:[input(0),input(1)]},'',init.uploadToken))).status,200);assert.equal((await state.storage.list({prefix:'q:'})).size,2);
 assert.equal((await deck.fetch(request('/publish','POST',{},'',init.uploadToken))).status,403);assert.equal((await deck.fetch(request('/publish','POST',{},'owner'))).status,200);
 const publicDeck=await(await deck.fetch(request('/'))).json();assert.equal(publicDeck.uploadToken,undefined);assert.ok(!JSON.stringify(publicDeck).includes(init.uploadToken));assert.equal((await deck.fetch(request('/questions/0','PUT',input(0),'',init.uploadToken))).status,403);
});
test('malformed batches are atomic and old drafts obtain an owner-only capability on resume',async()=>{
 const state={storage:new Storage()},deck=new SharedDecks(state);await deck.fetch(request('/init','POST',{id,title:'Batch',count:2,rights:true},'owner'));const meta=await state.storage.get('meta');delete meta.uploadToken;await state.storage.put('meta',meta);
 const draft=await(await deck.fetch(request('/draft','GET',undefined,'owner'))).json();assert.match(draft.uploadToken,/^[a-f0-9]{64}$/);
 for(const items of [[input(0),input(0)],[input(0),{...input(1),image:{mimeType:'image/png',data:'invalid'}}],Array.from({length:6},(_,i)=>input(i))])assert.equal((await deck.fetch(request('/questions-batch','PUT',{items},'',draft.uploadToken))).status,400);
 assert.equal((await state.storage.list({prefix:'q:'})).size,0);
 await state.storage.put('meta',{...await state.storage.get('meta'),created:Date.now()-86400001});assert.equal((await deck.fetch(request('/questions-batch','PUT',{items:[input(0)]},'',draft.uploadToken))).status,403);
});
test('scoped upload bypasses repeated Google identity calls but remains limited to image PUT routes',async()=>{
 const state={storage:new Storage()},deck=new SharedDecks(state),init=await(await deck.fetch(request('/init','POST',{id,title:'Batch',count:1,rights:true},'owner'))).json(),previous=globalThis.fetch;let identityCalls=0;
 const env={SHARED_DECKS:{idFromName:name=>name,get:()=>({fetch:(url,options)=>deck.fetch(new Request(url,options))})}};
 try{globalThis.fetch=async()=>{identityCalls++;throw Error('Google identity must not be called for each image')};
  const response=await sharedDeckRoute(new Request(`https://worker/v1/decks/${id}/questions-batch`,{method:'PUT',headers:{Authorization:'Upload '+init.uploadToken},body:JSON.stringify({items:[input(0)]})}),env,{});assert.equal(response.status,200);assert.equal(identityCalls,0);
  for(const path of ['/publish','/draft']){const response=await sharedDeckRoute(new Request(`https://worker/v1/decks/${id}${path}`,{method:path==='/draft'?'GET':'POST',headers:{Authorization:'Upload '+init.uploadToken}}),env,{});assert.equal(response.status,401)}
  for(const path of ['/init','/catalog','/reserve'])assert.equal((await sharedDeckRoute(new Request(`https://worker/v1/decks/${id}${path}`,{method:'POST',headers:{Authorization:'Upload '+init.uploadToken}}),env,{})).status,404);
 }finally{globalThis.fetch=previous}
});
