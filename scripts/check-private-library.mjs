import assert from 'node:assert/strict';
const base=process.env.AI_API_BASE;if(!base)throw Error('Configure the public AI_API_BASE repository variable before checking private sync.');
const root=new URL(base);if(root.protocol!=='https:')throw Error('Private sync requires HTTPS.');
for(const [path,authorization]of [['/v1/library/status',null],['/v1/library/media/'+'0'.repeat(64),null],['/v1/library/status','Bearer qa-invalid-not-a-real-token']]){
 const response=await fetch(new URL(path,root),{headers:{Origin:'https://devsepa.github.io',...(authorization?{Authorization:authorization}:{})},signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,401,`Private route ${path} must reject unauthenticated/invalid identity`);assert.match(response.headers.get('Cache-Control'),/private.*no-store/);const body=await response.json();assert.equal(typeof body.error,'string');assert.equal(body.questions,undefined);
}
const catalog=await fetch(new URL('/v1/decks',root),{headers:{Origin:'https://devsepa.github.io'},signal:AbortSignal.timeout(20000)});assert.equal(catalog.status,200,'Existing public decks must remain available after the new private-storage migration');assert.ok(Array.isArray(await catalog.json()));
console.log('Private library deployment verified: binding reachable, anonymous and invalid identities rejected, no private data exposed, public catalog preserved.');
