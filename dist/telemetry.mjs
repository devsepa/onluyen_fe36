const names=new Set(['image_ms','image_error','ai_ms','ai_error','shared_hit','shared_miss','local_hit','js_error','rejection']);
export function createTelemetry({base,fetcher=fetch,window:win=globalThis.window}={}){
 const pending=[];let timer;
 function record(name,ms=0){if(!base||!names.has(name))return;pending.push({name,ms:Math.max(0,Math.min(120000,Math.round(Number(ms)||0))),device:win?.innerWidth<760?'mobile':'desktop'});if(pending.length>=20)flush();else timer??=setTimeout(flush,15000)}
 function flush(){clearTimeout(timer);timer=null;if(!pending.length)return;const events=pending.splice(0,30);Promise.resolve(fetcher(new URL('/v1/quality/metrics',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events}),keepalive:true,credentials:'omit'})).catch(()=>{});if(pending.length)timer=setTimeout(flush,15000)}
 const onError=()=>record('js_error'),onRejection=()=>record('rejection');win?.addEventListener('error',onError);win?.addEventListener('unhandledrejection',onRejection);win?.addEventListener('pagehide',flush);
 return {record,flush,dispose(){clearTimeout(timer);win?.removeEventListener('error',onError);win?.removeEventListener('unhandledrejection',onRejection);win?.removeEventListener('pagehide',flush)}};
}
