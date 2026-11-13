import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GOOGLE_CLIENT_ID} from '../dist/site-config.mjs';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json(),page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080/'));
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const config=(await readFile('dist/site-config.mjs','utf8')).replace("AI_API_BASE=''","AI_API_BASE='https://qa-shared.example'");
ws.onmessage=async event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Fetch.requestPaused')await call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(config).toString('base64')});else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Page.javascriptDialogOpening')await call('Page.handleJavaScriptDialog',{accept:true})};
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function waitFor(expression){for(let i=0;i<80;i++){try{if(await evaluate(expression))return}catch(error){if(!/context|navigat|null/i.test(error.message))throw error}await pause(100)}throw Error('Timed out: '+expression)}
await call('Page.enable');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*site-config.mjs*'}]});
const png=(await readFile('tests/fixtures/vision-smoke.png')).toString('base64'),deckId='11111111-1111-4111-8111-111111111111';
const questions=Array.from({length:3},(_,i)=>({id:'shared-'+i,stem:'Slide '+(i+1),options:'ABCD'.split('').map(id=>({id,text:''})),answer:'A',verified:true,answerSource:'speaker-notes',explanation:'Explanation',slide:i+1,url:'',sourceId:'shared-'+deckId,sharedDeck:deckId,sharedIndex:i,sourceName:'DBI202 · QA',extraction:'ocr'}));
const mock=await call('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.calls=[];window.google={accounts:{oauth2:{revoke:()=>{}}}};const original=fetch;window.fetch=(url,init={})=>{
 const path=new URL(url,location.href).pathname;if(String(url).startsWith('https://www.googleapis.com/drive/'))return Promise.resolve(Response.json({files:[]}));
 if(String(url).startsWith('https://qa-shared.example/')){calls.push({path,method:init.method||'GET',body:init.body?JSON.parse(init.body):null,auth:init.headers?.Authorization});
 if(path.endsWith('/images/0')||path.endsWith('/images/1')||path.endsWith('/images/2'))return Promise.resolve(new Response(Uint8Array.from(atob(${JSON.stringify(png)}),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}}));
 if((init.method||'GET')==='GET'&&path==='/v1/decks')return Promise.resolve(Response.json([{id:${JSON.stringify(deckId)},title:'DBI202 · QA',count:3,created:Date.now()}]));
 if(path.endsWith('/draft'))return Promise.resolve(Response.json({uploaded:JSON.parse(sessionStorage.getItem('qa-uploaded')||'[]'),published:false}));
 if(init.method==='PUT'){const index=Number(path.split('/').at(-1));if(window.failUpload&&index===1)return Promise.resolve(Response.json({error:'Google 429 temporary limit'},{status:429}));const uploaded=JSON.parse(sessionStorage.getItem('qa-uploaded')||'[]');if(!uploaded.includes(index))uploaded.push(index);sessionStorage.setItem('qa-uploaded',JSON.stringify(uploaded));}
 if((init.method||'GET')==='GET')return Promise.resolve(Response.json({id:${JSON.stringify(deckId)},title:'DBI202 · QA',questions:${JSON.stringify(questions)}}));
 return Promise.resolve(Response.json(init.method==='POST'&&path==='/v1/decks'?{id:${JSON.stringify(deckId)}}:{ok:true}));}return original(url,init)};
`});
try{
 await evaluate(`localStorage.clear();sessionStorage.clear();localStorage.setItem('sot-ai-auto','false');location.reload()`);await waitFor(`!!document.querySelector('[data-use-deck]')`);
 assert.equal(await evaluate(`document.querySelector('#shared').hidden`),false);assert.equal(await evaluate(`sessionStorage.getItem('sot-google-session')`),null);
 await evaluate(`document.querySelector('[data-use-deck]').click()`);await waitFor(`!!document.querySelector('#start')`);
 await evaluate(`document.querySelector('#count').value=3;Math.random=()=>0;document.querySelector('#start').click()`);await waitFor(`document.querySelector('.slide-media-img')?.naturalWidth>0`);
 const first=await evaluate(`JSON.parse(localStorage.getItem('sot-session')).questions.map(q=>q.id)`);assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-o]')].map(b=>b.dataset.o)`),['A','B','C','D']);assert.equal(await evaluate(`calls.some(c=>c.auth)`),false);
 await evaluate(`document.querySelector('#submit').click();document.querySelector('#again').click();document.querySelector('#count').value=3;document.querySelector('[name="mode"][value="exam"]').click();Math.random=()=>0.999;document.querySelector('#start').click()`);
 const second=await evaluate(`JSON.parse(localStorage.getItem('sot-session')).questions.map(q=>q.id)`);assert.notDeepEqual(first,second);assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sot-session')).questions.every(q=>q.options.map(o=>o.id).join('')==='ABCD')`),true);
 await evaluate(`document.querySelector('#submit').click();document.querySelector('[data-view="library"]').click();document.querySelector('#publishDeck').click()`);
 assert.equal(await evaluate(`document.querySelector('#publishRights').checked`),false);await evaluate(`document.querySelector('#publishForm').requestSubmit()`);assert.equal(await evaluate(`calls.some(c=>c.method==='POST')`),false);
 await evaluate(`sessionStorage.setItem('sot-google-session',JSON.stringify({token:'qa-token',expires:Date.now()+3600000,clientId:${JSON.stringify(GOOGLE_CLIENT_ID)},profile:{name:'QA'}}));location.reload()`);await waitFor(`!!document.querySelector('#publishDeck')`);
 await evaluate(`failUpload=true;document.querySelector('#publishDeck').click();document.querySelector('#deckTitle').value='QA shared deck';document.querySelector('#publishRights').checked=true;document.querySelector('#publishForm').requestSubmit()`);await waitFor(`document.querySelector('#publishStatus').textContent.includes('24 giờ')`);
 assert.deepEqual(await evaluate(`JSON.parse(sessionStorage.getItem('qa-uploaded'))`),[0,2]);assert.ok(await evaluate(`JSON.parse(localStorage.getItem('sot-deck-draft')).id`));assert.equal(await evaluate(`calls.some(c=>c.path.endsWith('/publish'))`),false);
 await evaluate(`location.reload()`);await waitFor(`!!document.querySelector('#publishDeck')`);await evaluate(`document.querySelector('#publishDeck').click()`);assert.equal(await evaluate(`document.querySelector('#deckTitle').value`),'QA shared deck');await evaluate(`document.querySelector('#publishRights').checked=true;document.querySelector('#publishForm').requestSubmit()`);await waitFor(`document.querySelector('#publishStatus').textContent.includes('Đã đăng bộ đề')`);
 assert.equal(await evaluate(`calls.filter(c=>c.method==='PUT').length`),1);assert.equal(await evaluate(`calls.filter(c=>c.path.endsWith('/publish')).length`),1);assert.equal(await evaluate(`calls.filter(c=>c.method==='PUT').every(c=>c.body.image.mimeType==='image/png'&&!c.body.question.token)`),true);
 await mkdir('outputs/shared',{recursive:true});
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await pause(50);
  assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false);assert.equal(await evaluate(`document.querySelector('#publishForm').scrollWidth>document.querySelector('#publishForm').clientWidth`),false);
  const screenshot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`outputs/shared/publish-${theme}-${width}.png`,Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.querySelector('#closePublish').click();document.querySelector('[data-view="shared"]').click()`);await waitFor(`!!document.querySelector('[data-use-deck]')`);const list=await call('Page.captureScreenshot',{format:'png'});await writeFile(`outputs/shared/catalog-${theme}-${width}.png`,Buffer.from(list.data,'base64'));await evaluate(`document.querySelector('[data-view="library"]').click();document.querySelector('#publishDeck').click()`);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',checks:['guest uses stored images without Google','study and exam shuffle question order only','explicit sharing consent','authenticated image upload and finalize','light/dark PC/mobile/narrow']}));
}finally{await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:mock.identifier});await call('Fetch.disable');ws.close()}
