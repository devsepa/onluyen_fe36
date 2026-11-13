import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {GOOGLE_CLIENT_ID} from '../dist/site-config.mjs';
const pages=await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080/'));
if(!page)throw Error('Start the isolated QA browser first.');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
let sequence=0;const pending=new Map();
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})}
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
await evaluate(`if(location.origin!=='http://localhost:8080')throw Error('Wrong origin');localStorage.clear();location.reload()`);await new Promise(resolve=>setTimeout(resolve,500));
await evaluate(`(()=>{
 const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=700;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,1400,700);c.fillStyle='black';c.font='34px Arial';['Which clause filters groups after aggregation?','A. WHERE','B. HAVING','C. ORDER BY','D. SELECT'].forEach((t,i)=>c.fillText(t,60,100+i*90));
 const image=canvas.toDataURL();const originalFetch=window.fetch;window.qaCalls=[];
 const presentation={presentationId:'qa_import',title:'SEMESTER_2_QA',slides:Array.from({length:4},(_,i)=>({objectId:'page'+i,pageElements:[{image:{contentUrl:image}}],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'note'},pageElements:[{objectId:'note',shape:{text:{textElements:[{textRun:{content:'B'}}]}}}]}}}))};
 window.fetch=(url,options)=>{
  if(url==='https://openidconnect.googleapis.com/v1/userinfo')return Promise.resolve(Response.json({sub:'qa-user',name:'Người học QA',email:'qa@example.com'}));
  if(String(url).startsWith('https://www.googleapis.com/drive/v3/files?'))return Promise.resolve(Response.json({files:[{id:'qa_import',name:'SEMESTER_2_QA',mimeType:'application/vnd.google-apps.presentation',modifiedTime:'2026-11-13T00:00:00Z'},{id:'qa_not_selected',name:'Sever_1_SEMESTER_3_DBI202_Tai_lieu_khong_chon',mimeType:'application/vnd.google-apps.presentation',modifiedTime:'2026-11-13T00:00:00Z'}]}));
  if(String(url).startsWith('https://www.googleapis.com/drive/v3/files/qa_import?'))return Promise.resolve(Response.json({modifiedTime:'2026-11-13T00:00:00Z'}));
  if(url==='https://slides.googleapis.com/v1/presentations/qa_import')return Promise.resolve(Response.json(presentation));
  if(String(url).includes('slides.googleapis.com')){qaCalls.push(url);return Promise.resolve(Response.json({error:'Unexpected request'},{status:500}))}
  return originalFetch(url,options);
 };
 window.google={accounts:{oauth2:{initTokenClient:settings=>{window.qaClientId=settings.client_id;return{requestAccessToken:()=>setTimeout(()=>settings.callback({access_token:'qa-placeholder',expires_in:3600}),0)}},hasGrantedAllScopes:()=>true,revoke:()=>{}}}};
 document.querySelector('#accountButton').click();document.querySelector('#accountLogin').click();
})()`);
async function waitFor(expression,timeout=45000){const started=Date.now();while(Date.now()-started<timeout){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,100))}throw Error('Timed out: '+await evaluate(`document.querySelector('#message').textContent`))}
await waitFor(`document.querySelectorAll('#selectedResources input').length===2`);
assert.equal(await evaluate(`window.qaClientId`),GOOGLE_CLIENT_ID,'fresh visitors must use the shared OAuth client');
assert.equal(await evaluate(`document.querySelector('#settings,#settingsMobile,#config,#clientId')===null`),true);
assert.equal(await evaluate(`document.querySelector('#accountName').textContent`),'Người học QA');
assert.equal(await evaluate(`document.querySelector('#accountEmail').textContent`),'qa@example.com');
assert.equal(await evaluate(`document.querySelector('#accountButton').classList.contains('connected')`),true);
assert.equal(await evaluate(`document.querySelectorAll('#selectedResources input:checked').length`),0);
assert.equal(await evaluate(`document.querySelector('#useResources').disabled`),true);
await mkdir('outputs/source-selection',{recursive:true});
for(const theme of ['light','dark'])for(const [label,width,height] of [['pc',1440,1100],['mobile',390,844]]){
 await evaluate(`if(document.documentElement.dataset.theme!==${JSON.stringify(theme)})document.querySelector('#themeToggle').click()`);
 await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
 await evaluate(`window.scrollTo(0,0);document.querySelector('#accountButton').click()`);
 const accountBounds=await evaluate(`(()=>{const r=document.querySelector('#accountMenu').getBoundingClientRect();return{left:r.left,right:r.right,viewport:innerWidth}})()`);
 assert.ok(accountBounds.left>=0&&accountBounds.right<=accountBounds.viewport,`${theme}/${label} account menu overflow`);
 const accountCapture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`outputs/source-selection/${theme}-${label}-account.png`,Buffer.from(accountCapture.data,'base64'));
 await evaluate(`document.querySelector('#accountMenu').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))`);
 assert.equal(await evaluate(`document.activeElement.id`),'accountLogout');
 await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
 await evaluate(`document.querySelector('.selected-heading').scrollIntoView({block:'start'})`);
 assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false,`${theme}/${label} overflow`);
 const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`outputs/source-selection/${theme}-${label}.png`,Buffer.from(capture.data,'base64'));
}
await evaluate(`document.querySelector('#selectedResources input').click()`);
assert.equal(await evaluate(`document.querySelector('#useResources').disabled`),false);
assert.ok((await evaluate(`document.querySelector('#useResources').textContent`)).includes('1 tài liệu'));
await evaluate(`document.querySelector('#selectedResources input').click()`);
assert.equal(await evaluate(`document.querySelector('#useResources').disabled`),true);
await evaluate(`document.querySelector('#selectedResources input').click();document.querySelector('#chooseFiles').click()`);
assert.equal(await evaluate(`document.querySelectorAll('#fileList input:checked').length`),1);
await evaluate(`document.querySelector('#filePicker').close();document.querySelector('#scan').click()`);
await waitFor(`!document.querySelector('#scan').disabled`);
assert.equal(await evaluate(`document.querySelectorAll('#selectedResources input:checked').length`),0,'rescan must not auto-select sources');
await evaluate(`document.querySelector('#selectedResources input').click();document.querySelector('#useResources').click();document.querySelector('[data-view="history"]').click()`);await waitFor(`JSON.parse(localStorage.getItem('sot-bank')||'[]').length===4`);
assert.equal(await evaluate(`document.querySelector('.nav.active').dataset.view`),'history','import must not navigate away from another task');
assert.equal(await evaluate(`document.querySelector('#message').hidden`),true,'source notices must not appear on history');
await evaluate(`document.querySelector('[data-view="sources"]').click()`);
assert.equal(await evaluate(`document.querySelector('#openImportedBank').hidden`),false);
await evaluate(`document.querySelector('#openImportedBank').click()`);
const result=await evaluate(`({active:document.querySelector('.nav.active').dataset.view,questions:document.querySelectorAll('.question-card').length,ready:document.querySelector('#ready').textContent,answers:JSON.parse(localStorage.getItem('sot-bank')).map(q=>q.answer),thumbnailCalls:qaCalls.length})`);
assert.equal(result.active,'library');assert.equal(result.questions,4);assert.equal(result.ready,'0');assert.deepEqual(result.answers,['B','B','B','B']);assert.equal(result.thumbnailCalls,0);
await evaluate(`document.querySelector('#accountButton').click();document.querySelector('#accountLogout').click()`);
assert.equal(await evaluate(`document.querySelector('#accountName').textContent`),'Khách');
assert.equal(await evaluate(`document.querySelector('#accountButton').classList.contains('connected')`),false);
assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sot-bank')).length`),4,'logout must preserve local study resources');
console.log(JSON.stringify({result:'passed',...result,selection:'unchecked by default, toggle and picker sync, rescan unchecked, unselected source not read',viewports:'PC/mobile × light/dark',note:'Mock Google authorization and API responses; real Tesseract browser OCR'}));ws.close();
