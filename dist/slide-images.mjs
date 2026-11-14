// Page-memory cache only: share pending requests, cap retained blobs, revoke on logout.
export function createSlideImageStore(load,{limit=100,revoke=url=>URL.revokeObjectURL(url)}={}){
 const entries=new Map();let epoch=0;
 function clear(){epoch++;for(const entry of entries.values())if(entry.url)revoke(entry.url);entries.clear()}
 function invalidate(key){const entry=entries.get(key);if(entry?.url)revoke(entry.url);entries.delete(key)}
 async function get(q){
  const key=q.mediaId?`local:${q.mediaId}`:q.sharedDeck?`shared:${q.sharedDeck}:${q.sharedIndex}`:q.url;if(entries.has(key)){const entry=entries.get(key);entries.delete(key);entries.set(key,entry);return entry.promise}
  const run=epoch,entry={url:null,promise:null};
  entry.promise=Promise.resolve().then(()=>load(q)).then(url=>{
   if(run!==epoch||entries.get(key)!==entry){revoke(url);throw Error('Ảnh đã được giải phóng.')}
   entry.url=url;
   for(const [old,item] of entries){if(entries.size<=(typeof limit==='function'?limit():limit))break;if(old!==key&&item.url)invalidate(old)}
   return url;
  }).catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error});
  entries.set(key,entry);return entry.promise;
 }
 return {get,clear,invalidate};
}
