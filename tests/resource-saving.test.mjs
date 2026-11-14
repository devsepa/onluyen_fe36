import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createResourcePolicy} from '../dist/resource-policy.mjs';
import {createSlideImageStore} from '../dist/slide-images.mjs';
import {createSlideBlobCache} from '../dist/slide-blob-cache.mjs';
import {createExplanationQueue} from '../dist/explanation-queue.mjs';
class Cache{
 constructor(){this.entries=new Map()}
 key(value){return value.url||String(value)}
 async put(key,value){this.entries.set(this.key(key),value.clone())}
 async match(key){return this.entries.get(this.key(key))?.clone()}
 async keys(){return [...this.entries.keys()].map(url=>new Request(url))}
 async delete(key){return this.entries.delete(this.key(key))}
}
class Storage{constructor(){this.entries=new Map()}async open(key){if(!this.entries.has(key))this.entries.set(key,new Cache());return this.entries.get(key)}async keys(){return [...this.entries.keys()]}async delete(key){return this.entries.delete(key)}}
test('resource policy defaults to economy for mobile/save-data and respects the persisted explicit choice',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},policy=createResourcePolicy({storage,mobile:()=>true,reducedMotion:()=>false});assert.equal(policy.economy,true);assert.equal(policy.memoryImages,8);assert.equal(policy.aheadImages,1);assert.equal(policy.aheadExplanations,1);let changes=0;policy.subscribe(()=>changes++);policy.set(false);assert.equal(changes,1);assert.equal(policy.memoryImages,24);assert.equal(createResourcePolicy({storage,mobile:()=>true}).economy,false);assert.equal(createResourcePolicy({connection:{saveData:true},mobile:()=>false}).economy,true);
});
test('image memory cache revokes old object URLs at the adaptive bound',async()=>{
 const revoked=[];let limit=8;const store=createSlideImageStore(async q=>'blob:'+q.url,{limit:()=>limit,revoke:url=>revoked.push(url)});for(let i=0;i<30;i++)await store.get({url:String(i)});assert.equal(revoked.length,22);limit=2;await store.get({url:'next'});assert.equal(revoked.length,29);store.clear();assert.equal(revoked.length,31);
});
test('public image bytes are shared across simultaneous view/AI loads and reused after reload in a separate bounded cache',async()=>{
 const storage=new Storage();let loads=0;const args={owner:()=> 'public',storage,cacheName:'sot-public-slide-images-v1',maxBytes:()=>9,load:async()=>{loads++;return new Blob(['1234'],{type:'image/png'})}},cache=createSlideBlobCache(args),q={url:'https://source.example/slide/1'};
 const [a,b]=await Promise.all([cache.get(q),cache.get(q)]);assert.equal(a.size,4);assert.equal(b.size,4);assert.equal(loads,1);await createSlideBlobCache(args).get(q);assert.equal(loads,1);for(let i=2;i<6;i++)await cache.get({url:'https://source.example/slide/'+i});await new Promise(r=>setTimeout(r,10));const entries=await(await storage.open(args.cacheName)).keys();assert.ok(entries.length<=2);assert.deepEqual(await storage.keys(),[args.cacheName]);
});
test('pausing explanation preparation lets the current result finish without starting queued work',async()=>{
 let loads=0,release;const queue=createExplanationQueue({load:async()=>{loads++;if(loads===1)await new Promise(r=>release=r);return {answer:'A',reason:'Reason',options:[{id:'A',text:'A',reason:'Correct'},{id:'B',text:'B',reason:'Wrong'}]}}}),q=id=>({id,sourceId:'test',url:id,stem:'Question',options:[{id:'A',text:'A'},{id:'B',text:'B'}],answer:'A'});queue.setPaused(true);const first=queue.request(q('1')),second=queue.request(q('2'));assert.equal(loads,0);queue.setPaused(false);assert.equal(loads,1);queue.setPaused(true);release();await first;assert.equal(loads,1);queue.setPaused(false);await second;assert.equal(loads,2);queue.dispose();
});
test('lowering the temporary-image budget prunes saved temporary files without another network request',async()=>{const storage=new Storage();let budget=20,loads=0;const cache=createSlideBlobCache({owner:()=> 'public',storage,cacheName:'public-test',maxBytes:()=>budget,load:async()=>{loads++;return new Blob(['1234'],{type:'image/png'})}});for(let i=0;i<3;i++)await cache.get({url:'https://example.test/'+i});budget=4;await cache.prune();assert.equal((await(await storage.open('public-test')).keys()).length,1);assert.equal(loads,3)});
async function worker(fetcher){const storage=new Storage(),handlers={};const self={registration:{scope:'https://test.example/app/'},location:{origin:'https://test.example'},clients:{claim:async()=>{}},skipWaiting(){},addEventListener:(name,fn)=>handlers[name]=fn};vm.runInNewContext(await readFile('dist/sw.js','utf8'),{self,caches:storage,fetch:fetcher,URL,Response,console});return {storage,handlers,async event(name,extra={}){let result;handlers[name]({...extra,waitUntil:p=>result=p,respondWith:p=>result=p});return result?await result:undefined}}}
test('service-worker activation deletes only old application caches and preserves private/public image data',async()=>{
 const w=await worker(async()=>new Response(''));for(const name of ['sot-private-slide-images-v1','sot-public-slide-images-v1','another-app-cache','sot-v20261114-features-1','sot-static-v2-oldest','sot-static-v2-previous','sot-static-v2-development'])await w.storage.open(name);await w.event('activate');const names=await w.storage.keys();for(const name of ['sot-private-slide-images-v1','sot-public-slide-images-v1','another-app-cache','sot-static-v2-previous','sot-static-v2-development'])assert.ok(names.includes(name));assert.ok(!names.includes('sot-static-v2-oldest'));assert.ok(!names.includes('sot-v20261114-features-1'));
});
test('versioned static assets are cache-first; version checks are not accumulated, and offline navigation awaits a real fallback',async()=>{
 let calls=0,offline=false;const w=await worker(async()=>{calls++;if(offline)throw Error('Offline');return new Response('module')});const request={url:'https://test.example/app/helper.mjs?v=release',method:'GET',mode:'cors'};assert.equal((await w.event('fetch',{request})).status,200);assert.equal((await w.event('fetch',{request})).status,200);assert.equal(calls,1);assert.equal(await w.event('fetch',{request:{...request,url:'https://test.example/app/version.json?check=123'}}),undefined);await(await w.storage.open('sot-static-v2-development')).put('https://test.example/app/',new Response('Offline home'));offline=true;assert.equal(await(await w.event('fetch',{request:{url:'https://test.example/app/?v=next',method:'GET',mode:'navigate'}})).text(),'Offline home');
});
test('cache quota failure never turns a successful online response into an offline error',async()=>{const w=await worker(async()=>new Response('online response'));const cache=await w.storage.open('sot-static-v2-development');cache.put=async()=>{throw Error('Quota exceeded')};const response=await w.event('fetch',{request:{url:'https://test.example/app/helper.mjs?v=current',method:'GET',mode:'cors'}});assert.equal(response.status,200);assert.equal(await response.text(),'online response')});
test('service worker caches the actual module graph and bounds runtime files, never error responses',async()=>{
 const urls=[],w=await worker(async request=>{const url=request.url||String(request);urls.push(url);if(url.endsWith('/app/'))return new Response('<script src="app.js?v=one"></script><link href="app.css?v=one"><script src="https://outside.example/code.js"></script>');if(url.includes('app.js'))return new Response("import {x} from './helper.mjs?v=one';");if(url.includes('bad'))return new Response('error',{status:500});return new Response('asset')});await w.event('install');assert.ok(urls.includes('https://test.example/app/helper.mjs?v=one'));assert.ok(!urls.some(url=>url.includes('outside.example')));for(let i=0;i<110;i++)await w.event('fetch',{request:{url:'https://test.example/app/file'+i+'.mjs?v=one',method:'GET',mode:'cors'}});const cache=await w.storage.open('sot-static-v2-development');assert.ok((await cache.keys()).length<=96);await w.event('fetch',{request:{url:'https://test.example/app/bad.mjs?v=one',method:'GET',mode:'cors'}});assert.equal(await cache.match('https://test.example/app/bad.mjs?v=one'),undefined);
});
