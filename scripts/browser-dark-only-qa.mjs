import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json(),ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)(m.result);pending.delete(m.id)}};
const call=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value},sleep=ms=>new Promise(r=>setTimeout(r,ms));
await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setBypassServiceWorker',{bypass:true});await call('Network.setCacheDisabled',{cacheDisabled:true});
await call('Page.navigate',{url:'http://localhost:8080/'});await sleep(500);
await run(`if(location.origin!=='http://localhost:8080')throw Error('Not QA');localStorage.setItem('sot-session','null');sessionStorage.removeItem('sot-google-session')`);
await mkdir('outputs/dark-only',{recursive:true});
for(const preference of ['light','dark'])for(const [width,height]of [[1440,900],[390,844],[320,568]]){
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:preference}]});await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
 await run(`localStorage.setItem('sot-theme','light');location.reload()`);await sleep(700);
 assert.equal(await run(`document.documentElement.dataset.theme`),'dark');assert.equal(await run(`getComputedStyle(document.documentElement).colorScheme`),'dark');assert.equal(await run(`localStorage.getItem('sot-theme')`),'dark');assert.equal(await run(`!!document.querySelector('#themeToggle')`),false);assert.ok(await run(`document.documentElement.scrollWidth<=innerWidth+1`));assert.equal(await run(`getComputedStyle(document.documentElement).getPropertyValue('--panel').trim()`),'#151c2e');
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`outputs/dark-only/${preference}-${width}.png`,Buffer.from(shot.data,'base64'));
}
await call('Emulation.setScriptExecutionDisabled',{value:true});await call('Page.reload');await sleep(400);assert.equal(await run(`document.documentElement.dataset.theme`),'dark');assert.equal(await run(`getComputedStyle(document.documentElement).colorScheme`),'dark');await call('Emulation.setScriptExecutionDisabled',{value:false});
await call('Page.navigate',{url:'http://localhost:8080/slingshot-preview.html'});await sleep(400);assert.equal(await run(`document.documentElement.dataset.theme`),'dark');assert.equal(await run(`!!document.querySelector('#theme')`),false);
await call('Page.navigate',{url:'http://localhost:8080/'});ws.close();console.log('Dark-only passed: legacy light preference, both system appearances, desktop/mobile/narrow widths, JavaScript disabled and game preview.');
