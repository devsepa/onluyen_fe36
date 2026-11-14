import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const pages=await(await fetch('http://127.0.0.1:9229/json/list')).json();const ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description)};
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value};const pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async expression=>{for(let i=0;i<100;i++){if(await run(expression))return;await pause(60)}throw Error('Timed out: '+expression+' '+errors.join(','))};
const q={id:'quality-where',sourceId:'quality',sourceName:'DBI202',stem:'Which SQL clause filters rows before GROUP BY?',options:[{id:'A',text:'WHERE'},{id:'B',text:'HAVING'}],answer:'A',verified:false,answerSource:'gemini',explanationSource:'gemini',explanation:'STALE_GUESSED_EXPLANATION',url:''};
await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setBypassServiceWorker',{bypass:true});await call('Network.setCacheDisabled',{cacheDisabled:true});
await call('Page.addScriptToEvaluateOnNewDocument',{source:`const previous=fetch;window.fetch=(url,init)=>{
if(String(url).includes('/v1/answers'))return new Promise(resolve=>setTimeout(()=>resolve(Response.json({model:'qa-model',answers:JSON.parse(init.body).questions.map(q=>({id:q.id,status:'answered',answer:'A',explanation:'WHERE lọc từng dòng trước khi GROUP BY; HAVING lọc nhóm sau khi tổng hợp.',tip:'WHERE lọc dòng trước nhóm; HAVING lọc nhóm sau GROUP BY.',optionReasons:q.options.map(o=>({...o,reason:o.id==='A'?'Lọc từng dòng trước khi nhóm.':'Chỉ lọc nhóm sau khi tổng hợp.'}))}))})),700));return previous(url,init)};`});
await call('Page.navigate',{url:'http://localhost:8080'});await pause(400);
await run(`localStorage.setItem('sot-bank',JSON.stringify([${JSON.stringify(q)}]));localStorage.setItem('sot-session',JSON.stringify({mode:'study',questions:[${JSON.stringify(q)}],current:0,answers:{},flags:[],started:Date.now(),done:false}));localStorage.removeItem('sot-explanation-cache-v1');location.reload()`);
await pause(800);await wait(`!!document.querySelector('[data-o="A"]')`);await run(`document.querySelector('[data-o="A"]').click()`);await pause(100);
assert.equal(await run(`document.querySelector('.feedback')?.textContent.includes('STALE_GUESSED_EXPLANATION')`),false,JSON.stringify(errors));
await wait(`!!document.querySelector('.explanation-tip-text')`);
assert.match(await run(`document.querySelector('.explanation-tip-text').textContent`),/WHERE lọc dòng trước nhóm/);
assert.match(await run(`document.querySelector('.explanation-answer').textContent`),/A — WHERE/);
await mkdir('outputs/answer-quality',{recursive:true});
for(const theme of ['light','dark'])for(const width of [1440,390,320]){
 await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<900});await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)};window.dispatchEvent(new Event('resize'))`);await pause(100);
 const bounds=await run(`({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,choices:[...document.querySelectorAll('[data-o]')].map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}))})`);
 assert.ok(bounds.sw<=bounds.w+1&&bounds.sh<=bounds.h+1,JSON.stringify(bounds));for(const button of bounds.choices)assert.ok(button.top>=0&&button.bottom<=bounds.h+1);
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`outputs/answer-quality/${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
}
assert.deepEqual(errors,[]);ws.close();console.log('Fresh explanations hide stale guesses; choice content and memory aid visible in 6 desktop/mobile/theme checks.');
