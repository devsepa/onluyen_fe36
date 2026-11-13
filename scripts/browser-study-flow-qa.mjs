import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080'));
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const questions=Array.from({length:5},(_,i)=>({id:'q'+i,sourceId:'qa-source',url:'',stem:'Which SQL keyword selects a range?',options:['A','B','C','D'].map(id=>({id,text:id==='A'?'BETWEEN':'Other choice'})),answer:'A',verified:true,explanation:'BETWEEN chọn các giá trị trong khoảng. '.repeat(80)}));
await mkdir('outputs/study-flow',{recursive:true});
for(const theme of ['light','dark'])for(const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]){
 await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});
 await run(`localStorage.setItem('sot-bank',JSON.stringify(${JSON.stringify(questions)}));localStorage.setItem('sot-theme',${JSON.stringify(theme)});localStorage.setItem('sot-auto-advance','false');localStorage.setItem('sot-session',JSON.stringify({mode:'study',questions:${JSON.stringify(questions)},current:1,answers:{q0:'B',q2:'B',q3:'B'},flags:[],started:Date.now(),done:false}));location.reload()`);
 for(let i=0;i<60;i++){await pause(80);if(await run(`!!document.querySelector('[data-view="practice"]')`))break}
 await run(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.querySelector('[data-view="practice"]').click()`);await pause(100);
 await run(`document.querySelector('[data-o="B"]').click()`);
 assert.ok(await run(`!!document.querySelector('.feedback-inline-exp:not([hidden])')`));
 const bounds=await run(`({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,buttons:[...document.querySelectorAll('.choice-pill,#submit,.next-btn')].map(e=>({top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom}))})`);
 assert.ok(bounds.sw<=width+1&&bounds.sh<=height+1,JSON.stringify({width,height,bounds}));
 for(const b of bounds.buttons)assert.ok(b.top>=0&&b.bottom<=height+1,JSON.stringify({width,height,b}));
 assert.equal(await run(`document.querySelector('.feedback-toggle-btn')`),null);
 assert.equal(await run(`document.querySelector('.feedback-inline-exp span').textContent`),questions[1].explanation.trimEnd());
 assert.equal(await run(`getComputedStyle(document.querySelector('.feedback-inline-exp')).overflowY`),'auto');
 await run(`document.querySelector('.feedback-inline-exp').scrollTop=100000`);
 assert.ok(await run(`document.querySelector('.feedback-inline-exp').scrollTop>0`));
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`outputs/study-flow/${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
 if(width===1440){await run(`document.querySelector('.study-auto-toggle input').click()`);await pause(5200);assert.equal(await run(`JSON.parse(localStorage.getItem('sot-session')).current`),4)}
}
for(const mode of ['study','exam']){
 const multi=structuredClone(questions);multi[1].answer='AC';
 await run(`localStorage.setItem('sot-auto-advance','true');localStorage.setItem('sot-session',JSON.stringify({mode:${JSON.stringify(mode)},questions:${JSON.stringify(multi)},current:1,answers:{q0:'A',q2:'A',q3:'A'},flags:[],started:Date.now(),deadline:Date.now()+600000,done:false}));location.reload()`);
 await pause(300);await run(`document.querySelector('[data-o="A"]').click();document.querySelector('[data-o="C"]').click()`);
 assert.equal(await run(`!!document.querySelector('.feedback')`),false);
 if(mode==='study'){
  assert.equal(await run(`JSON.parse(localStorage.getItem('sot-session')).answers.q1`),undefined);
  await run(`document.querySelector('#checkMultiple').click()`);await pause(5200);
  assert.equal(await run(`JSON.parse(localStorage.getItem('sot-session')).current`),4);
 }else{
  assert.equal(await run(`!!document.querySelector('.study-auto-toggle,.feedback-inline-exp')`),false);
  assert.equal(await run(`JSON.parse(localStorage.getItem('sot-session')).answers.q1`),'AC');
 }
}
ws.close();console.log('8 viewport/theme combinations passed; full inline explanation, correct/incorrect auto advance, multi-answer confirmation and exam secrecy passed.');
