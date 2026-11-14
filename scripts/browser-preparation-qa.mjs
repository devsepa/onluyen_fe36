import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const pages=await(await fetch('http://127.0.0.1:9230/json/list')).json(),ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description)};
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async expression=>{for(let i=0;i<100;i++){if(await run(expression))return;await pause(60)}throw Error('Timed out '+expression+' '+JSON.stringify(errors))};
await call('Page.enable');await call('Network.enable');await call('Runtime.enable');await call('Network.setBypassServiceWorker',{bypass:true});await call('Network.setCacheDisabled',{cacheDisabled:true});
await call('Page.addScriptToEvaluateOnNewDocument',{source:`
const nativeFetch=fetch,deckId='11111111-1111-4111-8111-111111111111';let state='waiting';
window.google={accounts:{oauth2:{initTokenClient:settings=>({requestAccessToken:()=>settings.callback({access_token:'qa-placeholder',expires_in:3600})}),hasGrantedAllScopes:()=>true,revoke(){}}}};
window.fetch=(url,init={})=>{const address=String(url),path=new URL(address,location.href).pathname;
 if(address==='https://openidconnect.googleapis.com/v1/userinfo')return Promise.resolve(Response.json({sub:'prep-qa',name:'QA',email:'preparation-qa@example.com',email_verified:true}));
 if(address.startsWith('https://www.googleapis.com/drive/v3/files?'))return Promise.resolve(Response.json({files:[]}));
 if(path==='/v1/decks')return Promise.resolve(Response.json([{id:deckId,title:'Sever_1_SEMESTER_3_DBI202',count:375,created:Date.now()}]));
 if(path==='/v1/quality/access')return Promise.resolve(Response.json({moderator:true}));
 if(path.startsWith('/v1/preparation')){if(init.method==='POST'){state=path.endsWith('/pause')?'paused':'running';return Promise.resolve(Response.json({ok:true}))}return Promise.resolve(Response.json({jobs:[{id:deckId,title:'Sever_1_SEMESTER_3_DBI202',status:state,total:375,ready:24,cursor:27,reused:10,conflicts:2,uncertain:1,failed:0,lastError:state==='waiting'?'Đang nghỉ theo hạn mức AI. Máy chủ sẽ tự tiếp tục.':''}]}))}
 return nativeFetch(url,init);
};localStorage.removeItem('sot-session');sessionStorage.removeItem('sot-google-session');`});
await call('Page.navigate',{url:'http://localhost:8080'});await wait(`document.querySelector('.shared-badge')?.closest('article').textContent.includes('24/375')`);
assert.equal(await run(`document.querySelector('#prepareExplanations').hidden`),true);
await mkdir('outputs/preparation',{recursive:true});
async function screenshots(prefix){for(const theme of ['light','dark'])for(const width of [1440,390,320]){await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await pause(80);const bounds=await run(`({w:innerWidth,sw:document.documentElement.scrollWidth,d:(()=>{const d=document.querySelector('dialog[open]');if(!d)return null;const r=d.getBoundingClientRect();return {left:r.left,right:r.right,sw:d.scrollWidth,cw:d.clientWidth}})()})`);assert.ok(bounds.sw<=bounds.w+1,JSON.stringify(bounds));if(bounds.d)assert.ok(bounds.d.left>=0&&bounds.d.right<=bounds.w+1&&bounds.d.sw<=bounds.d.cw+1,JSON.stringify(bounds));const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`outputs/preparation/${prefix}-${theme}-${width}.png`,Buffer.from(shot.data,'base64'))}}
await screenshots('public');
await run(`window.google={accounts:{oauth2:{initTokenClient:settings=>({requestAccessToken:()=>settings.callback({access_token:'qa-placeholder',expires_in:3600})}),hasGrantedAllScopes:()=>true,revoke(){}}}};document.querySelector('#accountButton').click();document.querySelector('#accountLogin').click()`);await wait(`document.querySelector('#prepareExplanations')?.hidden===false`);await run(`document.querySelector('#prepareExplanations').click()`);
await wait(`!![...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='Tạm dừng')`);await screenshots('manage');
await run(`[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='Tạm dừng').click()`);await wait(`!![...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='Bắt đầu / Tiếp tục')`);
await run(`[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='Bắt đầu / Tiếp tục').click()`);await wait(`!![...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='Tạm dừng')`);
assert.deepEqual(errors,[]);ws.close();console.log('Public preparation progress, restricted management, pause/resume and 12 desktop/mobile/theme checks passed.');
