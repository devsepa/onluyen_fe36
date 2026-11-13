import assert from 'node:assert/strict';
const base=process.env.AI_API_BASE;if(!base)throw Error('Missing AI_API_BASE');
async function request(path,method='GET',body){let response;for(let i=0;i<6;i++){response=await fetch(new URL(path,base),{method,headers:{Origin:'https://devsepa.github.io',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});if(response.status!==404||i===5)return response;await response.arrayBuffer();await new Promise(r=>setTimeout(r,3000))}}
const access=await request('/v1/quality/access');assert.equal(access.status,200);assert.equal((await access.json()).moderator,false);
for(const path of ['/v1/quality/reports','/v1/quality/metrics','/v1/explanations/'+'0'.repeat(64)])assert.equal((await request(path)).status,403,'Guest must not read moderation data');
assert.equal((await request('/v1/quality/report','POST',{type:'invalid'})).status,400,'Invalid reports must never be stored');
assert.equal((await request('/v1/quality/metrics','POST',{events:[]})).status,200,'Anonymous aggregate storage must be reachable');
const status=await request('/v1/explanations/status','POST',{keys:['0'.repeat(64)]});assert.equal(status.status,200);assert.equal((await status.json()).entries['0'.repeat(64)].available,false);
console.log('Quality deployment verified: anonymous access, guarded reports/metrics/cache editing, report validation, aggregate storage and cache-revision lookup.');
