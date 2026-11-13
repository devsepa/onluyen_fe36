import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GOOGLE_CLIENT_ID} from '../dist/site-config.mjs';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json(),page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080/'));
if(!page)throw Error('Start the isolated QA browser on localhost:8080');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map(),errors=[];
function call(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))})}
const config=(await readFile('dist/site-config.mjs','utf8')).replace("AI_API_BASE=''","AI_API_BASE='https://qa-ai.example'");
ws.onmessage=async event=>{
 const m=JSON.parse(event.data);
 if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}
 else if(m.method==='Fetch.requestPaused')await call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(config).toString('base64')});
 else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
 else if(m.method==='Page.javascriptDialogOpening')await call('Page.handleJavaScriptDialog',{accept:true});
};
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(expression){for(let i=0;i<80;i++){try{if(await evaluate(expression))return}catch(error){if(!/null|context|navigat/i.test(error.message))throw error}await pause(100)}throw Error('Timed out '+expression)}
await call('Runtime.enable');await call('Page.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*site-config.mjs*'}]});
const mock=await call('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.aiCalls=[];window.aiDelay=20;window.aiFail=false;
 const original=window.fetch;
 window.fetch=(url,init)=>{
  if(String(url).startsWith('https://www.googleapis.com/drive/v3/files?'))return Promise.resolve(Response.json({files:[]}));
  if(String(url)==='https://slides.googleapis.com/v1/presentations/qa_ai')return Promise.resolve(Response.json({presentationId:'qa_ai',slides:[]}));
  if(String(url).startsWith('https://qa-ai.example/')){
   const questions=JSON.parse(init.body).questions;aiCalls.push(questions);
   return new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve(aiFail?Response.json({error:'Hạn mức QA'},{status:429}):Response.json({answers:questions.map(q=>({id:q.id,status:'answered',answer:'B',explanation:'Giải thích AI để kiểm tra.'})),model:'qa-model'})),aiDelay);init.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Stopped','AbortError'))},{once:true})});
  }
  return original(url,init);
 };
`});
try{
 await evaluate(`localStorage.clear();sessionStorage.clear();sessionStorage.setItem('sot-google-session',JSON.stringify({token:'qa-test-token',expires:Date.now()+3600000,profile:{name:'QA AI'},clientId:${JSON.stringify(GOOGLE_CLIENT_ID)}}));localStorage.setItem('sot-bank',JSON.stringify(Array.from({length:7},(_,i)=>({id:'ai-'+i,stem:'Question '+i,options:[{id:'A',text:'One'},{id:'B',text:'Two'}],answer:i===0?'A':'',verified:i===0,sourceId:'qa_ai',sourceName:'QA',slide:i+1,url:'https://docs.google.com/presentation/d/qa_ai/edit#slide=id.s'+i}))));location.reload()`);
 await waitFor(`!!document.querySelector('#aiProgress')&&document.querySelector('#aiProgress').textContent.includes('6 đáp án AI gợi ý')`);
 assert.deepEqual(await evaluate(`aiCalls.map(batch=>batch.length)`),[5,1]);
 assert.equal(await evaluate(`aiCalls.flat().some(q=>q.id==='ai-0'||q.url||q.sourceId)`),false);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sot-bank'))[0].answer`),'A');
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sot-bank')).filter(q=>q.answerSource==='gemini'&&!q.verified).length`),6);
 assert.equal(await evaluate(`document.querySelector('#ready').textContent`),'7');
 assert.equal(await evaluate(`document.querySelectorAll('.question-card .question-top .tag').length`),7);
 assert.equal(await evaluate(`[...document.querySelectorAll('.question-card .question-top .tag')].filter(el=>el.textContent.includes('Đáp án AI gợi ý')).length`),6);
 await evaluate(`document.querySelector('[data-view="practice"]').click();document.querySelector('#count').value=7;document.querySelector('#start').click();const s=JSON.parse(localStorage.getItem('sot-session'));document.querySelector('[data-index="'+s.questions.findIndex(q=>q.answerSource==='gemini')+'"]').click()`);
 assert.ok((await evaluate(`document.querySelector('.quiz-question .ai-answer-label').textContent`)).includes('Đáp án AI gợi ý'));
 await evaluate(`document.querySelector('#submit').click()`);assert.equal(await evaluate(`document.querySelectorAll('#result .ai-answer-label').length`),6);
 await evaluate(`document.querySelector('[data-view="library"]').click()`);
 await mkdir('outputs/ai',{recursive:true});
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});
  await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.querySelector('.ai-panel').scrollIntoView({block:'start'})`);await pause(70);
  assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false,`${theme}/${width} overflow`);
  const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`outputs/ai/${theme}-${width}.png`,Buffer.from(capture.data,'base64'));
 }
 await evaluate(`document.querySelector('#aiAccept').click()`);assert.equal(await evaluate(`document.querySelector('#ready').textContent`),'7');
 // A completed reload must not request already answered questions again.
 await evaluate(`location.reload()`);await waitFor(`!!document.querySelector('#aiStart')`);assert.equal(await evaluate(`document.querySelector('#aiStart').disabled`),true);assert.equal(await evaluate(`aiCalls.length`),0);
 // Persisted answers survive a cancelled following batch and can resume.
 await evaluate(`const b=JSON.parse(localStorage.getItem('sot-bank'));for(const q of b.slice(1)){q.answer='';q.verified=false;}localStorage.setItem('sot-bank',JSON.stringify(b));sessionStorage.removeItem('sot-ai-auto-attempt');location.reload()`);await waitFor(`!document.querySelector('#aiStart').disabled`);
 await evaluate(`aiDelay=400`);await waitFor(`JSON.parse(localStorage.getItem('sot-bank')).filter(q=>q.answer).length===6`);
 await evaluate(`document.querySelector('#aiStop').click()`);await waitFor(`document.querySelector('#aiProgress').textContent.includes('Đã dừng')`);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sot-bank')).filter(q=>q.answer).length`),6);
 await evaluate(`aiDelay=10;document.querySelector('#aiStart').click()`);await waitFor(`document.querySelector('#aiProgress').textContent.includes('1 đáp án AI gợi ý')`);
 // Missing token never sends questions, and no login popup is forced.
 await evaluate(`sessionStorage.clear();const b=JSON.parse(localStorage.getItem('sot-bank'));b[1].answer='';b[1].verified=false;localStorage.setItem('sot-bank',JSON.stringify(b));location.reload()`);await waitFor(`!document.querySelector('#aiStart').disabled`);
 await evaluate(`document.querySelector('#aiStart').click()`);assert.equal(await evaluate(`aiCalls.length`),0);assert.ok((await evaluate(`document.querySelector('#message').textContent`)).includes('Kết nối Google'));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',checks:['batch 5+1','no source answer overwritten','AI not auto verified','accept all proposals','reload avoids repeat','stop/resume keeps results','requires Google auth','PC/mobile light/dark/narrow']}));
}finally{
 await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:mock.identifier});await call('Fetch.disable');ws.close();
}
