import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSlideBlobCache} from '../dist/slide-blob-cache.mjs';
import {directSlideImage} from '../dist/direct-slide-image.mjs';
const bytes=readFileSync(new URL('./fixtures/vision-smoke.png',import.meta.url)),image=()=>new Blob([bytes],{type:'image/png'}),q={url:'https://docs.google.com/presentation/d/private/edit#slide=id.s1',sourceVersion:'v1'};
class MemoryCache{
 constructor(){this.data=new Map()}
 async match(key){return this.data.get(key.url||key)?.clone()}async put(key,response){this.data.set(key.url||key,response.clone())}async keys(){return [...this.data.keys()].map(key=>new Request(key))}async delete(key){this.data.delete(key.url||key)}
}
test('viewing/AI and later publishing reuse actual image bytes across reloads without Google calls',async()=>{
 const cache=new MemoryCache(),storage={open:async()=>cache};let loads=0;const options={owner:()=> 'alice@example.com',storage,load:async()=>{loads++;return image()}};
 const first=createSlideBlobCache(options);await first.get(q);await first.get(q);const reopened=createSlideBlobCache(options),blob=await reopened.get(q);assert.equal(loads,1);assert.deepEqual(Buffer.from(await blob.arrayBuffer()),bytes);
 for(const key of cache.data.keys()){assert.ok(!key.includes('alice'));assert.ok(!key.includes('private'));assert.ok(!key.includes('docs.google.com'))}
});
test('cache separates accounts and source versions, expires stale images, and gracefully tolerates storage failure',async()=>{
 let user='alice',clock=1000,loads=0;const cache=new MemoryCache(),storage={open:async()=>cache},images=createSlideBlobCache({owner:()=>user,storage,now:()=>clock,ttl:100,load:async()=>{loads++;return image()}});
 await images.get(q);user='bob';await images.get(q);await images.get({...q,sourceVersion:'v2'});clock+=101;await images.get(q);assert.equal(loads,4);
 const unavailable=createSlideBlobCache({owner:()=>user,storage:{open:async()=>{throw Error('Denied')}},load:async()=>image()});assert.equal((await unavailable.get(q)).size,bytes.length);
});
test('pending image loads are shared and logout prevents delayed private images from being cached',async()=>{
 const cache=new MemoryCache();let release,loads=0;const images=createSlideBlobCache({owner:()=> 'alice',storage:{open:async()=>cache},load:()=>{loads++;return new Promise(resolve=>release=resolve)}});
 const a=images.get(q),b=images.get(q);while(!release)await new Promise(resolve=>setTimeout(resolve,0));assert.equal(loads,1);images.clear();release(image());await assert.rejects(()=>a,/thay đổi/);await assert.rejects(()=>b,/thay đổi/);assert.equal(cache.data.size,0);
});
test('only a standalone uncropped unrotated image uses the direct source; composed slides keep thumbnails',()=>{
 const slide={pageElements:[{image:{contentUrl:'https://images.example/question.png'}}]};assert.equal(directSlideImage(slide),'https://images.example/question.png');
 assert.equal(directSlideImage({...slide,pageElements:[...slide.pageElements,{shape:{}}]}),null);
 assert.equal(directSlideImage({pageElements:[{...slide.pageElements[0],transform:{shearX:1}}]}),null);
 assert.equal(directSlideImage({pageElements:[{image:{...slide.pageElements[0].image,imageProperties:{cropProperties:{leftOffset:.1}}}}]}),null);
 assert.equal(directSlideImage({...slide,pageProperties:{pageBackgroundFill:{stretchedPictureFill:{}}}}),null);
});
test('oversized original images request a thumbnail for publishing instead of returning the same cached large blob',async()=>{
 const cache=new MemoryCache(),calls=[],images=createSlideBlobCache({owner:()=> 'alice',storage:{open:async()=>cache},load:async(q,options)=>{calls.push(!!options.forceThumbnail);return new Blob([new Uint8Array(options.forceThumbnail?50:200)],{type:'image/png'})}});
 await images.get(q);assert.equal((await images.get(q,{maxBytes:100})).size,50);assert.deepEqual(calls,[false,true]);assert.equal((await images.get(q,{maxBytes:100})).size,50);assert.equal(calls.length,2);
});
