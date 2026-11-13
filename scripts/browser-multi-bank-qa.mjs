import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GOOGLE_CLIENT_ID} from '../dist/site-config.mjs';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const ws=new WebSocket(pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080')).webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map(),errors=[];
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const config=(await readFile('dist/site-config.mjs','utf8')).replace("AI_API_BASE=''","AI_API_BASE='https://multi-qa.example'");
ws.onmessage=async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Fetch.requestPaused')await call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(config).toString('base64')});else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)};
const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async expression=>{for(let i=0;i<100;i++){await pause(70);if(await run(expression))return}throw Error('Timed out: '+expression+' '+JSON.stringify({errors,state:await run(`({message:document.querySelector('#message')?.textContent,selection:document.querySelector('#selectedResources')?.textContent,connected:!document.querySelector('#sourceControls')?.hidden})`)}))};
await call('Page.enable');await call('Runtime.discardConsoleEntries');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*site-config.mjs*'}]});
const q=(source,course,slide)=>({id:source+slide,sourceId:source,sourceName:course,slide,url:`https://docs.google.com/presentation/d/${source}/edit#slide=id.p${slide}`,stem:'Which clause filters rows?',options:[{id:'A',text:'WHERE'},{id:'B',text:'HAVING'}],answer:'A',answerSource:'manual',verified:true,explanation:'Saved explanation'});
const initial=[q('qa_dbi','DBI202',1),q('qa_dbi','DBI202',2)],jpd=[q('qa_jpd','JPD113',1),q('qa_jpd','JPD113',2)];
const deckId='11111111-1111-4111-8111-111111111111',shared={...q('shared-'+deckId,'WED201c',1),id:'shared-one',url:'',sharedDeck:deckId,sharedIndex:0};
const png=(await readFile('tests/fixtures/vision-smoke.png')).toString('base64');
const presentation={title:'Sever_1_PRN212',slides:[{objectId:'p1',pageElements:[{shape:{text:{textElements:[{textRun:{content:'Which clause filters groups?\nA. WHERE\nB. HAVING'}}]}}}],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'note'},pageElements:[{objectId:'note',shape:{text:{textElements:[{textRun:{content:'B\nHAVING filters groups.'}}]}}}]}}}]};
const mock=await call('Page.addScriptToEvaluateOnNewDocument',{source:`
 const originalFetch=fetch;window.google={accounts:{oauth2:{revoke(){}}}};
 window.fetch=(url,init={})=>{
  const address=String(url),path=new URL(address,location.href).pathname;
  if(address==='https://openidconnect.googleapis.com/v1/userinfo')return Promise.resolve(Response.json({sub:'qa',name:'QA',email:'multi-qa@example.com'}));
  if(address.startsWith('https://multi-qa.example/')){
   if(path.includes('/images/'))return Promise.resolve(new Response(Uint8Array.from(atob(${JSON.stringify(png)}),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}}));
   return Promise.resolve(Response.json(path==='/v1/decks'?[{id:${JSON.stringify(deckId)},title:'WED201c',count:1,created:Date.now()}]:{id:${JSON.stringify(deckId)},title:'WED201c',questions:[${JSON.stringify(shared)}]}));
  }
  if(address.startsWith('https://www.googleapis.com/drive/v3/files?'))return Promise.resolve(Response.json({files:[{id:'qa_prn',name:'Sever_1_PRN212',mimeType:'application/vnd.google-apps.presentation'}]}));
  if(address.startsWith('https://www.googleapis.com/drive/v3/files/'))return Promise.resolve(Response.json({modifiedTime:'2026-11-14T00:00:00Z'}));
  if(address.includes('/thumbnail?'))return Promise.resolve(Response.json({contentUrl:'https://image.multi-qa.example/test.png'}));
  if(address.startsWith('https://image.multi-qa.example/'))return Promise.resolve(new Response(Uint8Array.from(atob(${JSON.stringify(png)}),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}}));
  if(address.startsWith('https://slides.googleapis.com/v1/presentations/')){
   const presentationId=path.split('/').at(-1);
   return Promise.resolve(Response.json({...${JSON.stringify(presentation)},presentationId}));
  }
  return originalFetch(url,init);
 };
`});
async function importFile(questions){await run(`(()=>{const file=new File([${JSON.stringify(JSON.stringify({format:'slide-on-thi/v1',questions}))}],'bank.json',{type:'application/json'}),transfer=new DataTransfer();transfer.items.add(file);document.querySelector('#bankFile').files=transfer.files;document.querySelector('#bankFile').dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.querySelector('#bankFile').files.length===0`)}
const saved=()=>run(`JSON.parse(localStorage.getItem('sot-bank'))`);
await mkdir('outputs/multi-bank',{recursive:true});
try{
 await run(`localStorage.setItem('sot-bank',JSON.stringify(${JSON.stringify(initial)}));localStorage.removeItem('sot-session');localStorage.setItem('sot-ai-auto','false');sessionStorage.setItem('sot-google-session',JSON.stringify({token:'qa-placeholder',expires:Date.now()+3600000,profile:{name:'QA',email:'multi-qa@example.com'},clientId:${JSON.stringify(GOOGLE_CLIENT_ID)}}));location.reload()`);
 await pause(250);await wait(`!!document.querySelector('#publishDeck')`);
 if(await run(`document.querySelector('#sourceControls').hidden`))await run(`window.google={accounts:{oauth2:{initTokenClient:settings=>({requestAccessToken:()=>settings.callback({access_token:'qa-placeholder',expires_in:3600})}),hasGrantedAllScopes:()=>true,revoke(){}}}};document.querySelector('#accountButton').click();document.querySelector('#accountLogin').click()`);
 await wait(`document.querySelectorAll('#selectedResources input').length===1`);
 await importFile(jpd);assert.equal((await saved()).length,4);assert.equal((await saved()).find(q=>q.id==='qa_dbi1').explanation,'Saved explanation');
 await importFile(jpd);assert.equal((await saved()).length,4,'repeated JSON import does not duplicate');
 await run(`document.querySelector('[data-view="sources"]').click();document.querySelector('#sourceAutoAI').checked=false;document.querySelector('#selectedResources input').click();document.querySelector('#useResources').click();document.querySelector('[data-view="history"]').click()`);
 await wait(`JSON.parse(localStorage.getItem('sot-bank')).length===5`);
 assert.equal(await run(`document.querySelector('.nav.active').dataset.view`),'history');
 await wait(`!document.querySelector('#useResources').disabled`);
 await run(`document.querySelector('#useResources').click()`);await wait(`!document.querySelector('#useResources').disabled`);assert.equal((await saved()).length,5,'repeating Google Slides import preserves older subjects without duplicates');
 await run(`document.querySelector('[data-view="shared"]').click()`);await wait(`!!document.querySelector('[data-use-deck]')`);await run(`document.querySelector('[data-use-deck]').click()`);await wait(`JSON.parse(localStorage.getItem('sot-bank')).length===6`);
 await run(`document.querySelector('[data-view="shared"]').click();document.querySelector('[data-use-deck]').click()`);await pause(150);assert.equal((await saved()).length,6,'shared deck also accumulates without duplicates');
 await run(`location.reload()`);await wait(`!!document.querySelector('[data-view="practice"]')`);assert.equal((await saved()).length,6,'subjects survive reload');
 for(const theme of ['light','dark'])for(const [width,height]of [[1440,900],[390,844],[320,568]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
  await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.querySelector('[data-view="practice"]').click();window.scrollTo(0,0)`);
  const options=await run(`[...document.querySelector('#practiceSource').options].map(o=>o.value)`);assert.deepEqual(options,['','DBI202','JPD113','PRN212','WED201C']);
  await run(`document.querySelector('#practiceSource').value='DBI202';document.querySelector('#practiceSource').dispatchEvent(new Event('change'))`);assert.equal(await run(`document.querySelector('#poolCount').textContent`),'2');
  assert.ok(await run(`document.documentElement.scrollWidth<=innerWidth+1`));
  const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`outputs/multi-bank/${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
 }
 await run(`(()=>{window.qaExportBlob=null;const original=URL.createObjectURL;URL.createObjectURL=blob=>{qaExportBlob=blob;return original(blob)};document.addEventListener('click',e=>{if(e.target.closest('a[download]'))e.preventDefault()},true);document.querySelector('[data-view="library"]').click();document.querySelector('#exportBank').click()})()`);
 const backup=JSON.parse(await run(`qaExportBlob.text()`));assert.equal(backup.questions.length,6);assert.equal(backup.questions.find(q=>q.sharedDeck).sharedIndex,0);
 await run(`localStorage.setItem('sot-bank','[]');location.reload()`);await wait(`!!document.querySelector('#bankFile')`);await importFile(backup.questions);assert.equal((await saved()).length,6,'export restores all subjects, including shared-image references');
 assert.deepEqual(errors,[]);console.log('Multi-bank QA passed: JSON + Google Slides + shared deck accumulation, duplicate prevention, persistence, backup round trip, correct course pools and 6 PC/mobile theme layouts.');
}finally{await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:mock.identifier});await call('Fetch.disable');ws.close()}
