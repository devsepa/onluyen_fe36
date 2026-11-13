import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GOOGLE_CLIENT_ID} from '../dist/site-config.mjs';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const ws=new WebSocket(pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080')).webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const config=(await readFile('dist/site-config.mjs','utf8')).replace("AI_API_BASE=''","AI_API_BASE='https://speed-qa.example'");
ws.onmessage=async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Fetch.requestPaused')await call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(config).toString('base64')});else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)};
const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression){for(let i=0;i<120;i++){await pause(65);if(await run(expression))return}throw Error('Timed out: '+expression+' '+JSON.stringify({errors,feedback:await run(`document.querySelector('.feedback')?.textContent`)}))}
await call('Page.enable');await call('Runtime.discardConsoleEntries');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*site-config.mjs*'}]});
const png=(await readFile('tests/fixtures/vision-smoke.png')).toString('base64'),deck='11111111-1111-4111-8111-111111111111';
const questions=Array.from({length:4},(_,i)=>({id:'q'+i,sourceId:'shared-'+deck,sourceName:'DBI202',sharedDeck:deck,sharedIndex:i,slide:i+1,url:'',stem:'Which clause filters groups after aggregation?',options:'ABCD'.split('').map(id=>({id,text:''})),answer:'B',verified:true,answerSource:'speaker-notes',explanation:''}));
const mock=await call('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.aiCalls=[];window.aiMode=sessionStorage.getItem('qa-ai-mode')||'ok';window.releaseNew=false;
 const original=fetch;window.fetch=(url,init={})=>{
  const address=String(url),path=new URL(address,location.href).pathname;
  if(path.endsWith('/version.json'))return Promise.resolve(Response.json({version:window.releaseNew?'release-next':'2026.11.14.1'}));
  if(address==='https://openidconnect.googleapis.com/v1/userinfo')return Promise.resolve(Response.json({sub:'qa',name:'QA',email:'speed-qa@example.com'}));
  if(address.startsWith('https://www.googleapis.com/drive/'))return Promise.resolve(Response.json({files:[]}));
  if(address.startsWith('https://speed-qa.example/')){
   if(path.includes('/images/'))return Promise.resolve(new Response(Uint8Array.from(atob(${JSON.stringify(png)}),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}}));
   if(path==='/v1/decks')return Promise.resolve(Response.json([]));
   if(path==='/v1/answers'){
    const body=JSON.parse(init.body),q=body.questions[0];aiCalls.push({id:q.id,purpose:body.purpose,hasAnswer:'answer' in q});
    const response=()=>{
     if(window.aiMode==='fail')return Response.json({error:'AI đang bận, hãy thử lại.'},{status:503});
     const answer=window.aiMode==='conflict'?'A':q.id==='multi'?'BD':'B';
     return Response.json({model:'qa-model',answers:[{id:q.id,status:'answered',answer,kind:'question',labels:['A','B','C','D'],explanation:'Câu hỏi yêu cầu lọc nhóm sau GROUP BY. HAVING kiểm tra điều kiện trên nhóm đã tổng hợp.',optionReasons:[{id:'A',text:'WHERE',reason:'WHERE lọc từng hàng trước GROUP BY, không lọc nhóm sau tổng hợp.'},{id:'B',text:'HAVING',reason:'HAVING lọc các nhóm đã tổng hợp.'},{id:'C',text:'ORDER BY',reason:'ORDER BY chỉ sắp xếp kết quả, không lọc nhóm.'},{id:'D',text:'SELECT',reason:'SELECT chọn cột trả về.'}]}]});
    };
    if(window.aiMode==='hold')return new Promise((resolve,reject)=>{window.releaseAi=()=>resolve(response());init.signal?.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true})});
    return Promise.resolve(response());
   }
  }
  return original(url,init);
 };
`});
async function seed({mode='study',ai='ok',connected=true,prefetch=true,clearCache=true,multi=false}={}){
 const qs=structuredClone(questions);if(multi){qs[0].id='multi';qs[0].answer='BD'}
 await run(`localStorage.setItem('sot-bank',JSON.stringify(${JSON.stringify(qs)}));localStorage.setItem('sot-session',JSON.stringify({mode:${JSON.stringify(mode)},questions:${JSON.stringify(qs)},current:0,answers:{},flags:[],started:Date.now(),deadline:Date.now()+600000,done:false}));localStorage.setItem('sot-auto-advance','false');localStorage.setItem('sot-ai-auto','false');localStorage.setItem('sot-explanation-prefetch',${JSON.stringify(JSON.stringify(prefetch))});${clearCache?"localStorage.removeItem('sot-explanation-cache-v1');":''}sessionStorage.setItem('qa-ai-mode',${JSON.stringify(ai)});${connected?`sessionStorage.setItem('sot-google-session',JSON.stringify({token:'qa-token',expires:Date.now()+3600000,profile:{name:'QA',email:'speed-qa@example.com'},clientId:${JSON.stringify(GOOGLE_CLIENT_ID)}}));`:"sessionStorage.removeItem('sot-google-session');"}location.reload()`);
 await pause(200);await wait(`document.querySelector('.slide-media-img')?.naturalWidth>0&&document.querySelector('#practice').dataset.questionId===${JSON.stringify(multi?'multi':'q0')}`);
}
async function remember(){await run(`window.qaImage=document.querySelector('.slide-media-img');window.qaCard=document.querySelector('.quiz-question');window.qaChoices=document.querySelector('.choice-pills')`)}
async function stable(){assert.ok(await run(`qaImage===document.querySelector('.slide-media-img')&&qaCard===document.querySelector('.quiz-question')&&qaChoices===document.querySelector('.choice-pills')&&qaImage.isConnected`),'grading/retry must preserve the actual image and controls');}
async function fits(label){const result=await run(`({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,controls:[...document.querySelectorAll('.choice-pill[data-o],.quiz-answer-next,#submit,#checkMultiple')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{label:e.textContent,top:r.top,bottom:r.bottom,left:r.left,right:r.right}})})`);assert.ok(result.sw<=result.w+1&&result.sh<=result.h+1,label+' overflow '+JSON.stringify(result));for(const c of result.controls)assert.ok(c.top>=0&&c.bottom<=result.h+1&&c.left>=0&&c.right<=result.w+1,label+' clipped '+JSON.stringify(c))}
await mkdir('outputs/study-speed',{recursive:true});
try{
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await seed({ai:'hold'});await wait(`aiCalls.length===1`);assert.equal(await run(`!!document.querySelector('.feedback')`),false,'prefetch must not reveal explanations');
 await remember();await run(`document.querySelector('[data-o="A"]').click()`);await stable();assert.ok(await run(`document.querySelector('.feedback').textContent.includes('Đang tạo')`));
 await run(`releaseAi()`);await wait(`!!document.querySelector('.explanation-choice-reason')`);await stable();assert.ok(await run(`document.querySelector('.feedback').textContent.includes('Chọn B — HAVING')&&document.querySelector('.feedback').textContent.includes('WHERE lọc từng hàng')`));
 await wait(`aiCalls.length===2`);await run(`releaseAi()`);await wait(`aiCalls.length===3`);await run(`releaseAi()`);await pause(100);assert.equal(await run('aiCalls.length'),3,'initial preparation is capped at current plus next two');
 assert.ok(await run(`aiCalls.every(c=>c.purpose==='explanation'&&!c.hasAnswer)`));
 await run(`document.querySelector('.quiz-answer-next').click()`);await wait(`aiCalls.length===4`);assert.equal(await run(`!!document.querySelector('.feedback')`),false,'cached explanations still hidden before grading');await run(`releaseAi()`);await wait(`JSON.parse(localStorage.getItem('sot-explanation-cache-v1')).length===4`);
 await run(`location.reload()`);await pause(250);await wait(`document.querySelector('.slide-media-img')?.naturalWidth>0`);assert.equal(await run(`aiCalls.length`),0,'reload must reuse cached preparation');
 await seed({ai:'fail',prefetch:false});assert.equal(await run('aiCalls.length'),0,'opt-out prevents speculative requests');await remember();await run(`document.querySelector('[data-o="A"]').click()`);await wait(`!!document.querySelector('.explanation-retry')`);assert.equal(await run('aiCalls.length'),1);await pause(120);assert.equal(await run('aiCalls.length'),1,'failed request does not retry itself');await run(`aiMode='ok';document.querySelector('.explanation-retry').click()`);await wait(`!!document.querySelector('.explanation-choice-reason')`);await stable();assert.equal(await run('aiCalls.length'),2);
 await seed({connected:false,prefetch:false});await run(`document.querySelector('[data-o="A"]').click()`);await wait(`!!document.querySelector('.explanation-retry')`);assert.equal(await run('aiCalls.length'),0);assert.ok(await run(`document.querySelector('#accountButton').getBoundingClientRect().width>0`));
 await run(`window.google={accounts:{oauth2:{initTokenClient:settings=>({requestAccessToken:()=>settings.callback({access_token:'qa-token',expires_in:3600})}),hasGrantedAllScopes:()=>true,revoke(){}}}};document.querySelector('#accountButton').click();document.querySelector('#accountLogin').click()`);await wait(`!!document.querySelector('.explanation-choice-reason')`);assert.equal(await run(`JSON.parse(localStorage.getItem('sot-session')).answers.q0`),'A');
 await seed({ai:'conflict',prefetch:false});await run(`document.querySelector('[data-o="A"]').click()`);await wait(`!!document.querySelector('.explanation-retry')`);assert.ok(await run(`document.querySelector('.feedback').textContent.includes('khác đáp án gốc B')`));assert.equal(await run(`JSON.parse(localStorage.getItem('sot-bank'))[0].answer`),'B');
 await seed({multi:true,prefetch:false});await remember();await run(`document.querySelector('[data-o="B"]').click();document.querySelector('[data-o="D"]').click()`);await stable();assert.equal(await run(`!!document.querySelector('.feedback')`),false);assert.equal(await run('aiCalls.length'),0);await run(`document.querySelector('#checkMultiple').click()`);await wait(`!!document.querySelector('.explanation-answer')`);await stable();assert.equal(await run(`JSON.parse(localStorage.getItem('sot-session')).answers.multi`),'BD');
 for(const mode of ['study','exam'])for(const theme of ['light','dark'])for(const [width,height]of [[1440,900],[390,844],[320,568],[844,390]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});await seed({mode,prefetch:false});await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await fits(`${mode}/${theme}/${width}/before`);await remember();await run(`document.querySelector('[data-o="A"]').click()`);
  if(mode==='study')await wait(`!!document.querySelector('.explanation-choice-reason')`);else{assert.equal(await run('aiCalls.length'),0);assert.equal(await run(`!!document.querySelector('.feedback')`),false)}
  await stable();await fits(`${mode}/${theme}/${width}/graded`);
  const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`outputs/study-speed/${mode}-${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
 }
 await seed({prefetch:false});await run(`document.querySelector('[data-o="A"]').click()`);await wait(`!!document.querySelector('.explanation-answer')`);
 await run(`document.querySelector('[data-view="library"]').click();releaseNew=true;document.querySelector('footer .app-update-control').click()`);await wait(`!document.querySelector('.app-update-notice').hidden`);
 await run(`document.querySelector('[data-view="practice"]').click()`);await wait(`!!document.querySelector('.quiz-head .app-update-control:not([hidden])`);
 await run(`document.querySelector('.quiz-head .app-update-control').click()`);await wait(`!!document.querySelector('#appConfirmDialog[open]')`);await run(`document.querySelector('#appConfirmDialog .confirm-btn-ok').click()`);await pause(250);await wait(`location.search.includes('v=release-next')&&document.querySelector('.slide-media-img')?.naturalWidth>0`);assert.equal(await run(`JSON.parse(localStorage.getItem('sot-session')).answers.q0`),'A','updating preserves the active session');
 assert.deepEqual(errors,[]);console.log('Study speed QA passed: bounded prefetch and persistent cache, exact selected-choice explanation, stable image/control nodes on grading and retry, retry/login/conflict paths, multi-answer confirmation, 16 viewport/theme/mode layouts and safe version update.');
}finally{await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:mock.identifier});await call('Fetch.disable');ws.close()}
