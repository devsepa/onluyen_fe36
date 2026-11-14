// Only temporary application files belong here. Archive/private image caches are separate.
const RELEASE_VERSION='development';
const CACHE_PREFIX='sot-static-v2-';
const CACHE_NAME=CACHE_PREFIX+RELEASE_VERSION;
const BASE=new URL(self.registration.scope).pathname;
const MAX_ENTRIES=96;
const asset=url=>url.origin===self.location.origin&&url.pathname.startsWith(BASE)&&/\.(?:js|mjs|css|jpg|jpeg|png|svg|ico|json)$/.test(url.pathname)&&!url.pathname.endsWith('/version.json');
async function save(request,response){
 if(!response?.ok||response.type==='opaque')return false;
 try{const cache=await caches.open(CACHE_NAME);await cache.put(request,response.clone());const keys=await cache.keys();for(const key of keys.filter(key=>new URL(key.url).pathname!==BASE).slice(0,Math.max(0,keys.length-MAX_ENTRIES)))await cache.delete(key);return true}catch{return false}
}
async function existing(request){try{const current=await(await caches.open(CACHE_NAME)).match(request);if(current)return current;for(const key of (await caches.keys()).filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).reverse()){const response=await(await caches.open(key)).match(request);if(response)return response}}catch{}}
async function precache(){
 const home=new URL(BASE,self.location.origin),response=await fetch(home,{cache:'no-cache'});if(!response.ok)return;const html=await response.clone().text();if(!await save(home,response))return;
 const queue=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|mjs|css|jpg|jpeg|png|json)(?:\?[^"']*)?)["']/g)].map(m=>new URL(m[1],home)),seen=new Set();
 while(queue.length&&seen.size<MAX_ENTRIES-4){const url=queue.shift();if(!asset(url)||seen.has(url.href))continue;seen.add(url.href);try{const res=await fetch(url,{cache:'force-cache'});if(!res.ok)continue;await save(url,res);if(/\.(?:js|mjs)$/.test(url.pathname)&&!url.pathname.endsWith('/sw.js')){const code=await res.text();for(const m of code.matchAll(/from\s+['"](\.\/[^'"]+\.(?:js|mjs)(?:\?[^'"]*)?)['"]/g))queue.push(new URL(m[1],url))}}catch{/* Remaining cached files still work offline. */}}
}
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(precache().catch(()=>{}))});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys(),versions=keys.filter(k=>k.startsWith(CACHE_PREFIX)),keep=new Set([CACHE_NAME,...versions.filter(k=>k!==CACHE_NAME).slice(-1)]);await Promise.all(keys.filter(k=>(k.startsWith(CACHE_PREFIX)&&!keep.has(k))||/^sot-v\d/.test(k)).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE)||url.pathname.endsWith('/version.json'))return;
 if(request.mode==='navigate'){
  event.respondWith((async()=>{try{const response=await fetch(request);if(response.ok)await save(new URL(BASE,self.location.origin),response);return response}catch{return await existing(new URL(BASE,self.location.origin))||new Response('Hãy kết nối mạng để mở ứng dụng lần đầu.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}})());return;
 }
 if(!asset(url))return;
 event.respondWith((async()=>{const immutable=!!url.searchParams.get('v')||/\.(?:jpg|jpeg|png|svg|ico)$/.test(url.pathname);if(immutable){const cached=await existing(request);if(cached)return cached}try{const response=await fetch(request);if(response.ok)await save(request,response);return response}catch{return await existing(request)||new Response('Offline',{status:503})}})());
});
