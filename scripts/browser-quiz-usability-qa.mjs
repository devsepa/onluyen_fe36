import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const pages=await(await fetch('http://127.0.0.1:9231/json/list')).json(),ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description)};
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async expression=>{for(let i=0;i<100;i++){if(await run(expression))return;await pause(60)}throw Error('Timed out '+expression+' '+JSON.stringify(errors))};
const png=(await readFile('tests/fixtures/vision-smoke.png')).toString('base64');
await call('Page.enable');await call('Network.enable');await call('Runtime.enable');await call('Network.setBypassServiceWorker',{bypass:true});await call('Network.setCacheDisabled',{cacheDisabled:true});
await call('Page.addScriptToEvaluateOnNewDocument',{source:`
const previous=fetch;window.qaRequests=0;window.qaReports=[];
window.fetch=(url,init={})=>{const address=String(url),path=new URL(address,location.href).pathname;
 if(path==='/v1/answers'){window.qaRequests++;if(localStorage.getItem('qa-rate-limit')==='true')return Promise.resolve(Response.json({error:'rate_limit_exceeded'},{status:429,headers:{'Retry-After':'60'}}));return Promise.resolve(Response.json({model:'synthetic-qa',answers:JSON.parse(init.body).questions.map(q=>({id:q.id,status:'answered',answer:localStorage.getItem('qa-conflict')==='true'?'B':'A',explanation:'WHERE lọc từng dòng trước GROUP BY. '.repeat(65),tip:'WHERE lọc dòng trước nhóm; HAVING lọc nhóm sau GROUP BY.',optionReasons:q.options.map(o=>({...o,reason:'Lý do cụ thể cho lựa chọn '+o.id+'. '.repeat(8)}))}))}))}
 if(path.includes('/images/'))return Promise.resolve(new Response(Uint8Array.from(atob(${JSON.stringify(png)}),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}}));
 if(path==='/v1/quality/report'){window.qaReports.push(JSON.parse(init.body));return Promise.resolve(Response.json({id:'synthetic-report',ok:true}))}
 if(path==='/v1/decks')return Promise.resolve(Response.json([]));if(path==='/v1/preparation')return Promise.resolve(Response.json({jobs:[]}));if(path.includes('/v1/quality/'))return Promise.resolve(Response.json({ok:true,moderator:false}));
 return previous(url,init);
};
const vv=new EventTarget();Object.assign(vv,{height:innerHeight,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{value:vv,configurable:true});window.qaKeyboard=height=>{vv.height=height;vv.dispatchEvent(new Event('resize'))};
`});
await call('Page.navigate',{url:'http://localhost:8080'});await pause(400);await run(`localStorage.removeItem('qa-rate-limit')`);await mkdir('outputs/quiz-usability',{recursive:true});
const base={id:'usability-q',sourceId:'synthetic',sourceName:'DBI202',stem:'Which SQL clause filters rows before grouping?\n日本語の原文を保持します。',options:[{id:'A',text:'WHERE'},{id:'B',text:'HAVING'},{id:'C',text:'ORDER BY'},{id:'D',text:'GROUP BY'}],answer:'A',answerSource:'manual',verified:true,explanation:'',url:''};
let checks=0;
for(const mode of ['study','exam'])for(const image of [false,true])for(const conflict of mode==='study'?[false,true]:[false]){
 const q={...base,...(image?{sourceId:'shared-11111111-1111-4111-8111-111111111111',sharedDeck:'11111111-1111-4111-8111-111111111111',sharedIndex:0,slide:1}:{} )};
 await run(`localStorage.setItem('qa-conflict',${JSON.stringify(String(conflict))});localStorage.setItem('sot-bank',JSON.stringify([${JSON.stringify(q)}]));localStorage.setItem('sot-session',JSON.stringify({mode:${JSON.stringify(mode)},questions:[${JSON.stringify(q)}],current:0,answers:{'usability-q':'C'},wrongAttempts:{'usability-q':['B','C','D']},flags:[],started:Date.now(),deadline:Date.now()+600000,done:false}));localStorage.removeItem('sot-explanation-cache-v1');localStorage.removeItem('sot-ai-cooldown-v1');location.reload()`);
 await pause(350);await wait(`document.querySelector('#practice')?.dataset.questionId==='usability-q'`);
 if(mode==='study')await wait(conflict?`!!document.querySelector('.explanation-conflict')`:`!!document.querySelector('.explanation-tip-text')`);
 else{assert.equal(await run(`!!document.querySelector('.feedback')`),false);assert.equal(await run(`window.qaRequests`),0)}
 if(image)await wait(`document.querySelector('.slide-media-img')?.naturalWidth>0`);
 for(const theme of ['light','dark'])for(const [width,height]of [[1440,900],[390,844],[390,667],[320,568],[844,390],[568,320]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)};window.qaKeyboard(innerHeight);window.dispatchEvent(new Event('resize'))`);await pause(100);
  const bounds=await run(`({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,buttons:[...document.querySelectorAll('.quiz-question [data-o],.quiz-answer-next,#submit')].map(e=>({text:e.textContent,top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})),tipFirst:!document.querySelector('.explanation-tip-box')||!!(document.querySelector('.explanation-tip-box').compareDocumentPosition(document.querySelector('.exp-options-grid'))&Node.DOCUMENT_POSITION_FOLLOWING)})`);
  assert.ok(bounds.sw<=width+1&&bounds.sh<=height+1,JSON.stringify({mode,image,conflict,width,height,bounds}));for(const button of bounds.buttons)assert.ok(button.top>=0&&button.bottom<=height+1&&button.left>=0&&button.right<=width+1,JSON.stringify({mode,image,conflict,width,height,button}));assert.ok(bounds.tipFirst);
  if(mode==='study'&&conflict){assert.equal(await run(`document.querySelector('.comparison-original .comparison-answer').textContent`),'A — WHERE');assert.equal(await run(`document.querySelector('.comparison-proposed .comparison-answer').textContent`),'B — HAVING');assert.equal(await run(`JSON.parse(localStorage.getItem('sot-session')).questions[0].answer`),'A')}
  if(mode==='study'&&image&&([390,568,1440].includes(width))){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`outputs/quiz-usability/${conflict?'conflict':'tip'}-${theme}-${width}-${height}.png`,Buffer.from(shot.data,'base64'))}
  checks++;
 }
}
// Eight choices must remain touchable on narrow and short screens.
for(const mode of ['study','exam']){
 const eight={...base,answer:'AC',options:'ABCDEFGH'.split('').map(id=>({id,text:'Original 選択肢 '+id}))};
 await run(`localStorage.setItem('qa-conflict','true');localStorage.setItem('sot-bank',JSON.stringify([${JSON.stringify(eight)}]));localStorage.setItem('sot-session',JSON.stringify({mode:${JSON.stringify(mode)},questions:[${JSON.stringify(eight)}],current:0,answers:{'usability-q':'BD'},flags:[],started:Date.now(),deadline:Date.now()+600000,done:false}));localStorage.removeItem('sot-explanation-cache-v1');location.reload()`);await pause(350);await wait(`document.querySelectorAll('[data-o]').length===8`);
 for(const theme of ['light','dark'])for(const [width,height]of [[320,568],[568,320]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)};window.qaKeyboard(innerHeight);window.dispatchEvent(new Event('resize'))`);await pause(100);
  const bounds=await run(`({sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,buttons:[...document.querySelectorAll('[data-o],.quiz-answer-next')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})})`);assert.ok(bounds.sw<=width+1&&bounds.sh<=height+1,JSON.stringify(bounds));for(const b of bounds.buttons)assert.ok(b.left>=0&&b.right<=width+1&&b.top>=0&&b.bottom<=height+1,JSON.stringify(b));checks++;
 }
}
await run(`localStorage.setItem('qa-conflict','true');localStorage.setItem('sot-session',JSON.stringify({mode:'study',questions:[${JSON.stringify(base)}],current:0,answers:{},wrongAttempts:{'usability-q':['B','C']},flags:[],started:Date.now(),done:false}));localStorage.removeItem('sot-explanation-cache-v1');location.reload()`);await pause(600);await wait(`!!document.querySelector('.study-retry-feedback')`);assert.equal(await run(`!!document.querySelector('.explanation-conflict')`),false);
// Simulate a keyboard shrinking only the visual viewport while the layout stays tall.
await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await run(`localStorage.setItem('qa-conflict','true');localStorage.setItem('sot-session',JSON.stringify({mode:'study',questions:[${JSON.stringify(base)}],current:0,answers:{'usability-q':'C'},flags:[],started:Date.now(),done:false}));localStorage.removeItem('sot-explanation-cache-v1');location.reload()`);await pause(350);await wait(`!!document.querySelector('.explanation-conflict')`);
await run(`document.querySelector('.quality-report-button').click()`);await wait(`!!document.querySelector('.quality-dialog[open] textarea')`);assert.match(await run(`document.querySelector('.quality-dialog textarea').value`),/Đáp án đang lưu: A[\s\S]*AI đề xuất: B/);
await run(`document.querySelector('.quality-dialog textarea').focus();window.qaKeyboard(360)`);await pause(100);
const keyboard=await run(`(()=>{const d=document.querySelector('.quality-dialog'),r=d.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:window.visualViewport.height,keyboard:document.documentElement.classList.contains('keyboard-open')}})()`);assert.ok(keyboard.top>=0&&keyboard.bottom<=keyboard.height+1&&keyboard.keyboard,JSON.stringify(keyboard));
await run(`window.visualViewport.offsetTop=60;window.qaKeyboard(220)`);await pause(100);const offset=await run(`(()=>{const r=document.querySelector('.quality-dialog').getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()`);assert.ok(offset.top>=60&&offset.bottom<=280,JSON.stringify(offset));
await run(`window.visualViewport.offsetTop=0;window.qaKeyboard(360)`);await pause(100);
await run(`document.querySelector('.quality-dialog button[type=submit]').scrollIntoView({block:'nearest'})`);await pause(60);const send=await run(`(()=>{const r=document.querySelector('.quality-dialog button[type=submit]').getBoundingClientRect();return {top:r.top,bottom:r.bottom}})()`);assert.ok(send.top>=0&&send.bottom<=360,JSON.stringify(send));
await run(`document.querySelector('.quality-dialog button[type=submit]').click()`);await wait(`window.qaReports.length===1`);assert.equal(await run(`window.qaReports[0].question.answer`),'A');
// Long error feedback also stays inside the card on low screens.
await run(`localStorage.setItem('qa-rate-limit','true');localStorage.setItem('sot-session',JSON.stringify({mode:'study',questions:[${JSON.stringify(base)}],current:0,answers:{'usability-q':'C'},flags:[],started:Date.now(),done:false}));localStorage.removeItem('sot-explanation-cache-v1');location.reload()`);await pause(350);await wait(`!!document.querySelector('.explanation-retry')`);
for(const [width,height]of [[320,568],[568,320],[844,390]]){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await run(`window.qaKeyboard(innerHeight);window.dispatchEvent(new Event('resize'))`);await pause(100);await run(`document.querySelector('.explanation-retry').scrollIntoView({block:'nearest'})`);const retry=await run(`(()=>{const r=document.querySelector('.explanation-retry').getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}})()`);assert.ok(retry.top>=0&&retry.bottom<=height+1&&retry.left>=0&&retry.right<=width+1,JSON.stringify(retry));checks++}
await run(`localStorage.removeItem('qa-rate-limit')`);
assert.deepEqual(errors,[]);ws.close();console.log(checks+' desktop/mobile/orientation/theme checks passed; conflict answer preservation, exam secrecy and simulated keyboard report submission passed.');
