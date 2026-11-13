import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const pages=await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080/'));
if(!page)throw Error('Open an isolated QA browser on http://localhost:8080 first.');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
const pending=new Map(),errors=[];let sequence=0;
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})}
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error.message));else p?.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+' '+(m.params.exceptionDetails.exception?.description||''));else if(m.method==='Page.javascriptDialogOpening')call('Page.handleJavaScriptDialog',{accept:true})};
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(expression,timeout=5000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await sleep(100)}throw Error('Timed out: '+expression)}
await call('Page.enable');await call('Runtime.enable');
await evaluate(`if(location.origin!=='http://localhost:8080')throw Error('Unexpected QA origin');localStorage.clear();sessionStorage.clear();location.reload()`);await sleep(500);await waitFor(`!!document.querySelector('.nav.active')`);
await mkdir('outputs',{recursive:true});
async function screenshot(name,width,height){await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});await sleep(100);const result=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('outputs/'+name+'.png',Buffer.from(result.data,'base64'))}
assert.equal(await evaluate(`document.querySelector('.nav.active').dataset.view`),'sources');
await screenshot('sources-desktop',1440,1100);
await screenshot('sources-mobile',390,844);
assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false,'mobile sources overflow');
await evaluate(`document.querySelector('[data-view="library"]').click()`);
assert.equal(await evaluate(`document.querySelector('#library .empty h2').textContent`),'Ngân hàng đang chờ tài liệu');
await evaluate(`localStorage.setItem('sot-bank',JSON.stringify(Array.from({length:12},(_,i)=>({id:'qa-'+i,stem:'Which clause filters groups after aggregation? '+(i+1),options:[{id:'A',text:'WHERE'},{id:'B',text:'HAVING'},{id:'C',text:'ORDER BY'},{id:'D',text:'SELECT\\n© Hoàng Hoàng Buôn Source'}].reverse(),answer:'B',verified:true,sourceId:'qa_fixture',sourceName:'QA fixture · DBI202',slide:i+1,url:'https://docs.google.com/presentation/d/qa_fixture/edit#slide=id.s'+i}))));location.reload()`);
await sleep(400);await waitFor(`document.querySelectorAll('.question-card').length===10`);
assert.equal(await evaluate(`document.querySelector('#questions').textContent.includes('Hoàng Hoàng Buôn Source')`),false,'old imported watermarks must be removed without re-OCR');
assert.deepEqual(await evaluate(`[...document.querySelector('.question-card .options').children].map(o=>o.querySelector('.letter').textContent)`),['A','B','C','D']);
assert.equal(await evaluate(`(()=>{const rows=[...document.querySelector('.question-card .options').children].map(o=>o.getBoundingClientRect());return rows.every((r,i)=>!i||r.top>=rows[i-1].bottom)})()`),true,'choices must be a vertical list on PC');
await screenshot('library-desktop',1440,1100);
await screenshot('library-mobile',390,844);
assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false,'mobile library overflow');
await evaluate(`document.querySelector('[data-page="2"]').click()`);assert.equal(await evaluate(`document.querySelectorAll('.question-card').length`),2);
await evaluate(`document.querySelector('[data-edit]').click()`);assert.equal(await evaluate(`document.querySelector('#editQuestion').open`),true);await evaluate(`document.querySelector('#cancelEdit').click()`);
await evaluate(`document.querySelector('[data-view="practice"]').click()`);await screenshot('practice-desktop',1440,1100);
await evaluate(`document.querySelector('#count').value=2;document.querySelector('#start').click();document.querySelector('[data-o="A"]').click()`);
assert.equal(await evaluate(`!!document.querySelector('.feedback.incorrect')`),true);
assert.equal(await evaluate(`document.querySelectorAll('[data-q]:disabled').length`),4);
assert.equal(await evaluate(`(()=>{const q=JSON.parse(localStorage.getItem('sot-session')).questions[0];const ref=document.querySelector('.quiz-question .source-reference');return Number(ref.dataset.slide)===q.slide&&ref.querySelector('a').href===q.url&&ref.textContent.includes(q.sourceName)})()`),true,'study source must retain original slide after randomization');
await screenshot('study-mobile',390,844);
await evaluate(`location.reload()`);await sleep(300);await waitFor(`!!document.querySelector('.feedback.incorrect')`);
await evaluate(`document.querySelector('[data-index="1"]').click();document.querySelector('[data-o="B"]').click();document.querySelector('#submit').click()`);
await waitFor(`!!document.querySelector('.score-ring')`);assert.equal(await evaluate(`document.querySelector('.score-number').textContent`),'5.0');
assert.equal(await evaluate(`document.querySelector('.nav.active').dataset.view`),'history');
assert.deepEqual(await evaluate(`['sources','library','practice','history','result'].filter(id=>!document.getElementById(id).hidden)`),['result']);
assert.equal(await evaluate(`document.querySelector('#result .score-ring').getBoundingClientRect().width>0`),true);
assert.equal(await evaluate(`document.querySelectorAll('#result .source-reference a').length`),2,'result review must link to each original slide');
await screenshot('result-desktop',1440,1100);
await evaluate(`document.querySelector('[data-view="practice"]').click()`);
assert.equal(await evaluate(`document.querySelector('#start').getBoundingClientRect().width>0`),true,'practice must open setup rather than an old result');
await evaluate(`document.querySelector('[data-view="history"]').click();document.querySelector('[data-result]').click()`);
assert.equal(await evaluate(`document.querySelector('.nav.active').dataset.view`),'history');
await evaluate(`document.querySelector('#again').click();document.querySelector('[name=mode][value=exam]').click();document.querySelector('#count').value=2;document.querySelector('#start').click();document.querySelector('[data-o="A"]').click()`);
assert.equal(await evaluate(`document.querySelector('.feedback')===null`),true);assert.equal(await evaluate(`document.body.classList.contains('exam-active')`),true);
assert.equal(await evaluate(`(()=>{const q=JSON.parse(localStorage.getItem('sot-session')).questions[0];const ref=document.querySelector('.quiz-question .source-reference');return Number(ref.dataset.slide)===q.slide&&ref.querySelector('a').href===q.url})()`),true,'exam must show original slide reference');
await evaluate(`document.querySelector('[data-o="B"]').click()`);assert.equal(await evaluate(`JSON.parse(localStorage.getItem('sot-session')).answers['qa-0']==='B'||Object.values(JSON.parse(localStorage.getItem('sot-session')).answers)[0]==='B'`),true);
await screenshot('exam-desktop',1440,1100);await evaluate(`document.querySelector('#submit').click()`);await waitFor(`!!document.querySelector('.score-ring')`);
await evaluate(`document.querySelector('[data-view="history"]').click()`);assert.equal(await evaluate(`document.querySelectorAll('.history-item').length`),2);await screenshot('history-mobile',390,844);assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false,'mobile history overflow');
assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',checks:['sources and empty library','pagination and edit modal','immediate study feedback and reload','exam answer changes without feedback','grading and history','mobile overflow'],screenshots:'outputs/*.png'}));ws.close();
