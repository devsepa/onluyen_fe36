import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {GOOGLE_CLIENT_ID} from '../dist/site-config.mjs';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json(),page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080/'));
if(!page)throw Error('Start isolated QA Chrome on localhost:8080');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
function call(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))})}
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Page.javascriptDialogOpening')call('Page.handleJavaScriptDialog',{accept:true})};
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const pause=ms=>new Promise(r=>setTimeout(r,ms));async function waitFor(expression){for(let i=0;i<60;i++){if(await evaluate(expression))return;await pause(100)}throw Error('Timed out: '+expression)}
await call('Page.enable');await call('Runtime.enable');
const mock=await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.thumbnailCalls=0;window.google={accounts:{oauth2:{revoke:()=>{}}}};const original=window.fetch;window.fetch=(url,options)=>{if(String(url).startsWith('https://www.googleapis.com/drive/v3/files?'))return Promise.resolve(Response.json({files:[]}));if(String(url).includes('/thumbnail?')){thumbnailCalls++;return Promise.resolve(Response.json({contentUrl:'https://qa-images.example/not-an-image'}))}if(String(url).startsWith('https://qa-images.example/'))return Promise.resolve(new Response('broken',{headers:{'content-type':'image/png'}}));return original(url,options)};`});
try{
 const q={id:'review',stem:'How many weeks in a semester?\n200',content:'How many weeks in a semester?\n200\nA. 100\nB. 200',options:[{id:'A',text:'100'},{id:'B',text:'200'}],answer:'B',verified:true,extraction:'ocr',sourceId:'review',sourceName:'QA',slide:30,url:'https://docs.google.com/presentation/d/review/edit#slide=id.s30'};
 await evaluate(`localStorage.clear();sessionStorage.clear();localStorage.setItem('sot-ai-auto','false');localStorage.setItem('sot-bank',JSON.stringify([${JSON.stringify(q)}]));sessionStorage.setItem('sot-google-session',JSON.stringify({token:'qa-token',expires:Date.now()+3600000,profile:{name:'QA'},clientId:${JSON.stringify(GOOGLE_CLIENT_ID)}}));location.reload()`);await pause(400);await waitFor(`!!document.querySelector('.question-card')`);
 await waitFor(`thumbnailCalls>0&&document.querySelector('.question-card .question-title').getBoundingClientRect().height>0`);await pause(300);
 assert.equal(await evaluate(`document.querySelector('.question-card .question-title').classList.contains('collapsed-text')`),false,'broken image must reveal text');
 assert.ok((await evaluate(`document.querySelector('.question-card .question-title').textContent`)).includes('\n200\n'));
 await evaluate(`document.querySelector('[data-edit]').click();document.querySelector('[name="stem"]').value=${JSON.stringify('Updated SQL?\nA. SELECT 1\nB. SELECT 2')};document.querySelector('[name="answer"]').value='B';document.querySelector('#editForm').requestSubmit()`);
 const saved=await evaluate(`JSON.parse(localStorage.getItem('sot-bank'))[0]`);assert.equal(saved.stem,'Updated SQL?');assert.equal(saved.options[0].text,'SELECT 1');assert.equal(saved.options[1].text,'SELECT 2');
 // Explicitly confirm the edited answer and exercise study with new two-choice content.
 await evaluate(`document.querySelector('[data-verify]').click();document.querySelector('[data-view="practice"]').click();document.querySelector('#start').click()`);
 await pause(300);assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-o]')].map(b=>b.dataset.o)`),['A','B']);assert.equal(await evaluate(`document.querySelector('.quiz-question .question-title').classList.contains('collapsed-text')`),false);
 await evaluate(`document.querySelector('[data-o="B"]').click()`);await mkdir('outputs/review',{recursive:true});
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await pause(50);
  assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false);
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`outputs/review/${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',checks:['broken image reveals text','numbers/semester retained','edited choices synchronized','two-choice question not expanded','PC/mobile/narrow light/dark']}));
}finally{await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:mock.identifier});ws.close()}
