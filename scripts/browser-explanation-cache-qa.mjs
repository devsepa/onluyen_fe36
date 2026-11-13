import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {GOOGLE_CLIENT_ID} from '../dist/site-config.mjs';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const ws=new WebSocket(pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080')).webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const config=(await readFile('dist/site-config.mjs','utf8')).replace("AI_API_BASE=''","AI_API_BASE='https://speed-qa.example'");
const releaseVersion=(await readFile('dist/index.html','utf8')).match(/name="app-version" content="([^"]+)"/)[1];
ws.onmessage=async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Fetch.requestPaused')await call('Fetch.fulfillRequest',{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(config).toString('base64')});else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)};
const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression){for(let i=0;i<120;i++){await pause(65);if(await run(expression))return}throw Error('Timed out: '+expression+' '+JSON.stringify({errors,feedback:await run(`document.querySelector('.feedback')?.textContent`)}))}
await call('Page.enable');await call('Runtime.discardConsoleEntries');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*site-config.mjs*'}]});
const deck='11111111-1111-4111-8111-111111111111';
const questions=Array.from({length:4},(_,i)=>({id:'q'+i,sourceId:'shared-'+deck,sourceName:'DBI202',sharedDeck:deck,sharedIndex:i,slide:i+1,url:'',stem:'Which clause filters groups after aggregation?',options:'ABCD'.split('').map(id=>({id,text:''})),answer:'B',verified:true,answerSource:'speaker-notes',explanation:''}));
const mock=await call('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.aiCalls=[];window.aiMode=sessionStorage.getItem('qa-ai-mode')||'ok';window.releaseNew=false;
 window.qaSlideData=(()=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=560;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,1000,560);c.fillStyle='black';c.font='28px Arial';['Which clause filters groups after aggregation?','A. WHERE','B. HAVING','C. ORDER BY','D. SELECT'].forEach((text,i)=>c.fillText(text,45,80+i*65));return canvas.toDataURL()})();
 const original=fetch;window.fetch=(url,init={})=>{
  const address=String(url),path=new URL(address,location.href).pathname;
  if(path.endsWith('/version.json'))return Promise.resolve(Response.json({version:window.releaseNew?'release-next':${JSON.stringify(releaseVersion)}}));
  if(address==='https://openidconnect.googleapis.com/v1/userinfo')return Promise.resolve(Response.json({sub:'qa',name:'QA',email:'speed-qa@example.com'}));
  if(address.startsWith('https://www.googleapis.com/drive/'))return Promise.resolve(Response.json({files:[]}));
  if(address.startsWith('https://speed-qa.example/')){
   if(path.includes('/images/'))return original(qaSlideData);
   if(path==='/v1/decks')return Promise.resolve(Response.json([]));
   if(path==='/v1/answers'){
    const body=JSON.parse(init.body),q=body.questions[0];aiCalls.push({id:q.id,purpose:body.purpose,hasAnswer:'answer' in q,authorization:init.headers.Authorization});
    const response=()=>{
     if(window.aiMode==='fail')return Response.json({error:'AI đang bận, hãy thử lại.'},{status:503});
     const answer=window.aiMode==='conflict'?'A':q.id==='multi'?'BD':'B';
     return Response.json({model:'qa-model',answers:[{id:q.id,status:'answered',answer,reused:window.aiMode==='shared',kind:'question',labels:['A','B','C','D'],explanation:'Câu hỏi yêu cầu lọc nhóm sau GROUP BY. HAVING kiểm tra điều kiện trên nhóm đã tổng hợp.',optionReasons:[{id:'A',text:'WHERE',reason:'WHERE lọc từng hàng trước GROUP BY, không lọc nhóm sau tổng hợp.'},{id:'B',text:'HAVING',reason:'HAVING lọc các nhóm đã tổng hợp.'},{id:'C',text:'ORDER BY',reason:'ORDER BY chỉ sắp xếp kết quả, không lọc nhóm.'},{id:'D',text:'SELECT',reason:'SELECT chọn cột trả về.'}]}]});
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
async function fits(label){await run(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);const result=await run(`({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,controls:[...document.querySelectorAll('.choice-pill[data-o],.quiz-answer-next,#submit,#checkMultiple')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{label:e.textContent,top:r.top,bottom:r.bottom,left:r.left,right:r.right}})})`);assert.ok(result.sw<=result.w+1&&result.sh<=result.h+1,label+' overflow '+JSON.stringify(result));for(const c of result.controls)assert.ok(c.top>=0&&c.bottom<=result.h+1&&c.left>=0&&c.right<=result.w+1,label+' clipped '+JSON.stringify(c))}
await mkdir('outputs/study-speed',{recursive:true});
try{
 questions[0].explanation='Old AI summary without structured choices';questions[0].explanationSource='gemini';questions[0].answerSource='gemini';
 await seed({connected:false,prefetch:false});await run(`document.querySelector('[data-o="A"]').click()`);await wait(`!!document.querySelector('.explanation-answer')&&JSON.parse(localStorage.getItem('sot-bank'))[0].explanationDetails?.options.length===4`);assert.equal(await run(`aiCalls.length`),1);assert.equal(await run(`aiCalls[0].authorization`),undefined);assert.equal(await run(`aiCalls[0].hasAnswer`),false);
 await seed({connected:false,prefetch:false,clearCache:false});await run(`document.querySelector('[data-o="A"]').click()`);await wait(`!!document.querySelector('.explanation-heading')`);assert.equal(await run(`aiCalls.length`),0,'next visit uses saved local explanation');
 await seed({connected:false,prefetch:false,ai:'shared'});await run(`document.querySelector('[data-o="A"]').click()`);await wait(`document.querySelector('.explanation-storage-note')?.textContent.includes('Đã lưu')`);
 for(const theme of ['light','dark'])for(const [width,height]of [[1440,900],[390,844],[320,568],[844,390]]){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await pause(100);await fits();const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile('outputs/study-speed/cache-'+theme+'-'+width+'.png',Buffer.from(shot.data,'base64'))}
 assert.deepEqual(errors,[]);console.log('Anonymous explanation UI passed: legacy AI summary upgraded, structured details persisted, reload used local cache without AI, shared-cache provenance rendered, no answer key or Google token sent, eight desktop/mobile/theme layouts.');
}finally{await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:mock.identifier});await call('Fetch.disable');ws.close()}
