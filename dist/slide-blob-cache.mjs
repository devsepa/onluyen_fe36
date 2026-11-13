// Private images stay on this device. Keys contain hashes, never Google URLs/tokens.
export function createSlideBlobCache({owner,load,storage=globalThis.caches,now=Date.now,maxBytes=128*1024*1024,ttl=86400000}={}){
 const pending=new Map();let epoch=0,opened,indexPromise,maintenance=Promise.resolve();
 const open=()=>opened??=storage?.open('sot-private-slide-images-v1').catch(()=>null);
 async function keyFor(q,identity){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([identity.toLowerCase(),q.url,q.sourceVersion||null])));return new URL('/__sot_cached_slide__/'+[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join(''),globalThis.location?.origin||'https://local.invalid').href}
 async function trim(cache,key,size){indexPromise??=(async()=>new Map(await Promise.all((await cache.keys()).map(async request=>{const response=await cache.match(request);return [request.url||String(request),{size:Number(response?.headers.get('X-Bytes')||0),savedAt:Number(response?.headers.get('X-Saved-At')||0)}]}))))();const entries=await indexPromise;entries.delete(key);entries.set(key,{size,savedAt:now()});let total=[...entries.values()].reduce((n,e)=>n+e.size,0);for(const [old,entry]of entries){if(now()-entry.savedAt>ttl||total>maxBytes){await cache.delete(old);entries.delete(old);total-=entry.size}}}
 return {clear(){epoch++;pending.clear()},async get(q,options={}){
  const identity=owner();if(!identity||!q.url)return load(q,options);const run=epoch,key=await keyFor(q,identity);
  if(pending.has(key)){const shared=pending.get(key),blob=await shared;if(options.maxBytes&&blob.size>options.maxBytes){if(pending.get(key)===shared)pending.delete(key);return this.get(q,{...options,forceThumbnail:true})}return blob}
  const promise=(async()=>{
   const cache=await open();let cached,loadOptions=options;try{cached=await cache?.match(key)}catch{}
   if(cached&&now()-Number(cached.headers.get('X-Saved-At')||0)<ttl){const blob=await cached.blob();if(run!==epoch)throw Error('Tài khoản Google đã thay đổi.');if(!options.maxBytes||blob.size<=options.maxBytes){options.onCache?.();return blob}loadOptions={...options,forceThumbnail:true}}
   const blob=await load(q,loadOptions);if(run!==epoch)throw Error('Tài khoản Google đã thay đổi.');
   if(cache&&blob.size<=2100000&&blob.type.startsWith('image/'))try{await cache.put(key,new Response(blob,{headers:{'Content-Type':blob.type,'X-Saved-At':String(now()),'X-Bytes':String(blob.size)}}));maintenance=maintenance.catch(()=>{}).then(()=>trim(cache,key,blob.size));maintenance.catch(()=>{})}catch{}
   return blob;
  })();pending.set(key,promise);try{return await promise}finally{if(pending.get(key)===promise)pending.delete(key)}
 }};
}
