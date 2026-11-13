import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json(),page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080/'));
if(!page)throw Error('Start the isolated QA browser first');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map(),errors=[];
function call(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))})}
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Page.javascriptDialogOpening')call('Page.handleJavaScriptDialog',{accept:true})};
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(expression){for(let i=0;i<60;i++){try{if(await evaluate(expression))return}catch(error){if(!/null|context|navigat/.test(error.message))throw error}await pause(100)}throw Error('Timed out '+expression)}
await call('Page.enable');await call('Runtime.enable');await mkdir('outputs/multi',{recursive:true});
const fixture={id:'multi',stem:'Choose all correct answers.',options:'ABCDE'.split('').map(id=>({id,text:'Option '+id})),answer:'ACE',explanation:'Giải thích ghi chú: chọn đầy đủ A, C và E. にまん。',verified:true,sourceId:'multi_source',sourceName:'QA',slide:353,url:'https://docs.google.com/presentation/d/multi_source/edit#slide=id.s353'};
await evaluate(`localStorage.clear();sessionStorage.clear();localStorage.setItem('sot-bank',JSON.stringify([${JSON.stringify(fixture)}]));location.reload()`);
await waitFor(`!!document.querySelector('.question-card')`);
assert.equal(await evaluate(`document.querySelector('[data-answer]').value`),'ACE');
await evaluate(`document.querySelector('[data-view="practice"]').click();document.querySelector('#start').click()`);
assert.equal(await evaluate(`document.querySelector('#checkMultiple').disabled`),true);
await evaluate(`document.querySelector('[data-o="A"]').click();document.querySelector('[data-o="C"]').click()`);
assert.equal(await evaluate(`document.querySelector('.feedback')===null`),true);
await evaluate(`location.reload()`);await waitFor(`!!document.querySelector('#checkMultiple')`);
assert.equal(await evaluate(`document.querySelectorAll('.quiz-question .choice-pill.selected').length`),2);
await evaluate(`document.querySelector('[data-o="E"]').click()`);
for(const theme of ['light','dark'])for(const width of [1440,390,320]){
 await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);await pause(70);
 assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false,`${theme}/${width} overflow`);
 const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`outputs/multi/${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
}
await evaluate(`document.querySelector('#checkMultiple').click()`);
assert.equal(await evaluate(`document.querySelectorAll('.quiz-question .choice-pill.correct').length`),3);assert.equal(await evaluate(`document.querySelectorAll('.quiz-question .choice-pill:disabled').length`),5);
assert.ok((await evaluate(`document.querySelector('.feedback').textContent`)).includes('ACE'));
await evaluate(`document.querySelector('#submit').click()`);await waitFor(`!!document.querySelector('.score-ring')`);assert.equal(await evaluate(`document.querySelector('.score-number').textContent`),'10.0');assert.equal(await evaluate(`document.querySelectorAll('#result .choice-pill.correct').length`),3);
await evaluate(`document.querySelector('#again').click();document.querySelector('[name="mode"][value="exam"]').click();document.querySelector('#start').click()`);
for(const option of ['A','C','E','B'])await evaluate(`document.querySelector('[data-o="${option}"]').click()`);
assert.equal(await evaluate(`document.querySelectorAll('.quiz-question .choice-pill.selected').length`),4);assert.equal(await evaluate(`document.querySelector('.feedback')===null`),true);
await evaluate(`document.querySelector('#submit').click()`);await waitFor(`!!document.querySelector('.score-ring')`);assert.equal(await evaluate(`document.querySelector('.score-number').textContent`),'0.0');assert.equal(await evaluate(`document.querySelectorAll('#result .choice-pill.correct').length`),3);assert.equal(await evaluate(`document.querySelectorAll('#result .choice-pill.wrong').length`),1);
await evaluate(`document.querySelector('#retry').click()`);await waitFor(`!!document.querySelector('#checkMultiple')`);assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sot-session')).questions[0].answer`),'ACE');
assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-o]')].map(b=>b.dataset.o)`),['A','B','C','D','E']);
assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',checks:['multi library input','study draft reload','explicit check','three correct highlights','exact-set grading','exam extra option incorrect','retry','original choice order','PC/mobile/narrow light/dark']}));ws.close();
