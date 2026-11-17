import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json(),ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)(m.result);pending.delete(m.id)}};
const call=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
const run=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description);return r.result.value};
await call('Page.enable');await call('Page.bringToFront');await call('Animation.enable');await call('Animation.setPlaybackRate',{playbackRate:1});await call('Runtime.enable');await call('Network.enable');await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await call('Network.setBypassServiceWorker',{bypass:true});await call('Network.setCacheDisabled',{cacheDisabled:true});await call('Page.navigate',{url:'http://localhost:8080/'});await new Promise(r=>setTimeout(r,1000));
await run(`localStorage.removeItem('sot-background-motion');localStorage.setItem('sot-economy-mode','false');location.reload()`);await new Promise(r=>setTimeout(r,600));
for(const theme of ['light','dark'])for(const [width,height]of [[1440,900],[390,844],[320,568]]){
 await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});await run(`document.documentElement.dataset.theme='${theme}'`);await new Promise(r=>setTimeout(r,150));
 const state=await run(`(()=>{const c=document.querySelector('#stardustCanvas'),a=document.querySelector('.aurora-stream'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let pixels=0;for(let i=3;i<d.length;i+=4)if(d[i])pixels++;return {controls:!!c.ambientControls,pixels,animation:getComputedStyle(a).animationName,transform:getComputedStyle(a).transform,count:document.querySelectorAll('#appAmbientBg').length,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
 assert.ok(state.controls&&!state.overflow,JSON.stringify(state));assert.equal(state.count,1);assert.equal(state.animation,width>860?'auroraMorph':'none');await new Promise(r=>setTimeout(r,150));if(width>860){assert.ok(state.pixels>0);assert.notEqual(await run(`getComputedStyle(document.querySelector('.aurora-stream')).transform`),state.transform)}
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(`outputs/ambient-${theme}-${width}.png`,Buffer.from(shot.data,'base64'));
}
await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
for(const reduced of ['reduce','no-preference'])for(const economy of [true,false]){
 await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced}]});
 await run(`localStorage.setItem('sot-background-motion','off');location.reload()`);await new Promise(r=>setTimeout(r,500));
 await run(`document.documentElement.classList.toggle('economy-mode',${economy})`);await new Promise(r=>setTimeout(r,100));
 const moving=reduced==='no-preference'&&!economy;
 assert.equal(await run(`document.documentElement.dataset.backgroundMotion`),moving?'on':'off');
 assert.equal(await run(`!!document.querySelector('#backgroundMotionToggle')`),false);
 const before=await run(`({transform:getComputedStyle(document.querySelector('.aurora-stream')).transform,pixels:document.querySelector('#stardustCanvas').toDataURL()})`);await new Promise(r=>setTimeout(r,250));
 const after=await run(`({transform:getComputedStyle(document.querySelector('.aurora-stream')).transform,pixels:document.querySelector('#stardustCanvas').toDataURL()})`);
 if(moving){assert.notEqual(before.transform,after.transform);assert.notEqual(before.pixels,after.pixels)}else{assert.equal(before.transform,after.transform);assert.equal(before.pixels,after.pixels)}
}
console.log('PC/mobile light/dark verified; mobile, reduced-motion and economy use static backgrounds; desktop motion stays available.');ws.close();
