import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json(),page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080/')),ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)};
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value},pause=ms=>new Promise(r=>setTimeout(r,ms));
await call('Runtime.enable');await mkdir('outputs/sidebar',{recursive:true});
async function loaded(){for(let i=0;i<60;i++){try{if(await evaluate(`!!document.querySelector('#sidebarToggle')`))return}catch{}await pause(80)}throw Error('Sidebar did not load')}
async function screenshot(name){assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false);const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile('outputs/sidebar/'+name+'.png',Buffer.from(shot.data,'base64'))}
try{
 for(const theme of ['light','dark'])for(const width of [1440,1024,390,320]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await evaluate(`localStorage.clear();sessionStorage.clear();location.reload()`);await loaded();await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
  assert.ok(await evaluate(`innerWidth<=${width}+1`));const desktop=width>760;
  assert.equal(await evaluate(`document.querySelector('#sidebarToggle').getAttribute('aria-expanded')`),String(desktop));await screenshot(`${theme}-${width}-default`);
  await evaluate(`document.querySelector('#sidebarToggle').click()`);
  if(desktop){
   assert.equal(await evaluate(`document.querySelector('.sidebar').getBoundingClientRect().width`),78);assert.equal(await evaluate(`getComputedStyle(document.querySelector('main')).marginLeft`),'78px');assert.equal(await evaluate(`[...document.querySelectorAll('.nav')].every(e=>e.title&&e.getBoundingClientRect().width>0&&e.querySelector('.nav-text').getClientRects().length===0)`),true);
   await screenshot(`${theme}-${width}-collapsed`);await evaluate(`location.reload()`);await loaded();assert.equal(await evaluate(`document.body.classList.contains('sidebar-collapsed')`),true);await evaluate(`document.querySelector('#sidebarToggle').click()`);assert.equal(await evaluate(`document.body.classList.contains('sidebar-collapsed')`),false);
  }else{
   assert.equal(await evaluate(`document.querySelector('.sidebar nav').getBoundingClientRect().height>0`),true);await screenshot(`${theme}-${width}-expanded`);await evaluate(`document.querySelector('[data-view="library"]').click()`);assert.equal(await evaluate(`document.body.classList.contains('mobile-menu-open')`),false);assert.equal(await evaluate(`document.activeElement.id`),'sidebarToggle');await evaluate(`document.querySelector('#sidebarToggle').click();document.querySelector('.sidebar').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);assert.equal(await evaluate(`document.querySelector('#sidebarToggle').getAttribute('aria-expanded')`),'false');
  }
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',layouts:8,checks:['desktop icon rail and main width','persisted desktop preference','mobile menu auto-close and Escape','accessible titles and controls','light/dark PC/mobile/narrow']}));
}finally{ws.close()}
