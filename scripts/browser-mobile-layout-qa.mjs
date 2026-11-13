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
   if(path==='/v1/decks')return Promise.resolve(Response.json([{id:'11111111-1111-4111-8111-111111111111',title:'DBI202 ? Ng?n h?ng c?u h?i ?n t?p v? thi th? h?c k?',count:4,created:Date.now()}]));
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
await mkdir('outputs/mobile',{recursive:true});let checks=0;
async function capture(name){await pause(100);const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile('outputs/mobile/'+name+'.png',Buffer.from(shot.data,'base64'))}
async function fits(label,quiz=false){await pause(100);const b=await run(`(()=>{const panel=document.querySelector('section:not([hidden])'),r=document.querySelector('.page-content').getBoundingClientRect();return{width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,main:document.querySelector('main').getBoundingClientRect().width,left:r.left,right:r.right,bottom:document.documentElement.scrollHeight,controls:[...document.querySelectorAll(quizSelector)].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{text:e.textContent.slice(0,35),left:r.left,right:r.right,top:r.top,bottom:r.bottom}})}})()`.replace('quizSelector',JSON.stringify(quiz?'.quiz-question [data-o],#checkMultiple,.quiz-answer-next,#submit':'.page-content section:not([hidden]) button,.topbar button')));assert.ok(b.scroll<=b.width+1,label+' horizontal overflow '+JSON.stringify(b));assert.ok(b.left>=0&&b.right<=b.width+1&&b.main>b.width*.6,label+' cropped shell '+JSON.stringify(b));for(const c of b.controls){assert.ok(c.left>=-1&&c.right<=b.width+1,label+' clipped control '+JSON.stringify(c));if(quiz)assert.ok(c.top>=0&&c.bottom<=b.height+1,label+' vertical control '+JSON.stringify(c))}if(quiz)assert.ok(b.bottom<=b.height+1,label+' quiz overflow');checks++}
try{
 for(const theme of ['light','dark'])for(const [width,height]of [[320,568],[390,844],[844,390],[768,1024],[1440,900]]){
 await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
 await run(`localStorage.removeItem('sot-session');localStorage.setItem('sot-history',JSON.stringify([{id:'qa-history',mode:'study',questions:${JSON.stringify(questions)},answers:{q0:'A'},correct:1,finished:Date.now(),started:Date.now()-60000}]));localStorage.setItem('sot-bank',JSON.stringify(${JSON.stringify(questions)}));localStorage.setItem('sot-theme',${JSON.stringify(theme)});localStorage.setItem('sot-ai-auto','false');sessionStorage.setItem('sot-google-session',JSON.stringify({token:'qa-token',expires:Date.now()+3600000,profile:{name:'QA',email:'speed-qa@example.com'},clientId:${JSON.stringify(GOOGLE_CLIENT_ID)}}));location.reload()`);await pause(250);await wait(`!!document.querySelector('.library-manager')`);
 for(const view of ['shared','sources','library','practice','history']){await run(`(()=>{const b=document.createElement('button');b.dataset.view=${JSON.stringify(view)};document.body.append(b);b.click();b.remove()})()`);assert.equal(await run(`document.querySelector('#${view}').hidden`),false,view+' navigation');await fits(theme+'/'+width+'/'+view);if(width===320||width===390)await capture(theme+'-'+width+'-'+view)}
 await run(`document.querySelector('#accountButton').click()`);const menu=await run(`(()=>{const r=document.querySelector('#accountMenu').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()`);assert.ok(menu.left>=0&&menu.right<=width+1&&menu.bottom<=height+1,'account menu '+JSON.stringify(menu));await run(`document.querySelector('#accountButton').click()`);
 for(const mode of ['study','exam']){await seed({mode,connected:false,prefetch:false});await fits(theme+'/'+width+'/'+mode,true);await run(`document.querySelector('[data-o="A"]').click()`);await fits(theme+'/'+width+'/'+mode+'/graded',true);if(width<400)await capture(theme+'-'+width+'-'+mode)}
 }
 assert.deepEqual(errors,[]);console.log('Mobile layout QA passed: '+checks+' layout states; 320/390/768/844/1440 widths, both themes, all sections, account menu, study and exam controls.');
}finally{await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:mock.identifier});await call('Fetch.disable');ws.close()}
