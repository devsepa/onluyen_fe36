import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const targets=await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page=targets.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080/'));
if(!page)throw Error('Start the isolated QA browser on localhost:8080.');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
let sequence=0;const pending=new Map(),errors=[];
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})}
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text)};
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await call('Runtime.enable');await mkdir('outputs/themes',{recursive:true});
const checks=[];
for(const theme of ['light','dark']){
 await evaluate(`if(document.documentElement.dataset.theme!==${JSON.stringify(theme)})document.querySelector('#themeToggle').click()`);
 for(const [label,width,height] of [['pc',1440,1000],['mobile',390,844],['narrow',320,780],['tablet',768,1024]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
  for(const view of ['sources','library','practice','history','result']){
   if(view==='result')await evaluate(`document.querySelector('[data-view="history"]').click();document.querySelector('[data-result]').click()`);
   else await evaluate(`document.querySelector('[data-view="${view}"]').click()`);
   await pause(40);
   const layout=await evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,active:document.querySelector('.nav.active').dataset.view})`);
   assert.equal(layout.overflow,false,`${theme}/${label}/${view} horizontal overflow`);assert.equal(layout.active,view==='result'?'history':view);
   assert.deepEqual(await evaluate(`['sources','library','practice','history','result'].filter(id=>!document.getElementById(id).hidden)`),[view],`${theme}/${label}/${view} unrelated tab contents`);
   assert.equal(await evaluate(`document.getElementById('pageTitle').textContent`),{sources:'Tài liệu của tôi',library:'Ngân hàng câu hỏi',practice:'Ôn luyện & Thi thử',history:'Lịch sử & Kết quả',result:'Kết quả bài làm'}[view]);
   if(['pc','mobile'].includes(label)){const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`outputs/themes/${theme}-${label}-${view}.png`,Buffer.from(capture.data,'base64'))}
   checks.push(`${theme}/${label}/${view}`);
  }
  assert.equal(await evaluate(`document.querySelector('#settings,#settingsMobile,#config,#clientId')===null`),true,'visitor interface must not contain admin setup');
  await evaluate(`document.querySelector('[data-view="library"]').click();document.querySelector('[data-edit]').click()`);assert.equal(await evaluate(`document.querySelector('#editQuestion').open`),true);
  const dialog=await evaluate(`(()=>{const r=document.querySelector('#editQuestion').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}})()`);
  assert.ok(dialog.left>=0&&dialog.right<=dialog.width,`${theme}/${label} dialog overflow`);await evaluate(`document.querySelector('#editQuestion').close()`);
 }
 const contrast=await evaluate(`(()=>{
  const style=getComputedStyle(document.documentElement),v=name=>style.getPropertyValue(name).trim();
  function lum(hex){const raw=hex.replace('#','');const n=raw.length===3?raw.split('').map(c=>c+c).join(''):raw;const rgb=[0,2,4].map(i=>parseInt(n.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
  function ratio(a,b){const x=lum(v(a)),y=lum(v(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
  return {body:ratio('--text','--bg'),muted:ratio('--muted','--panel'),button:ratio('--accent-text','--accent'),correct:ratio('--success','--success-bg'),warning:ratio('--warning','--warning-bg')};
 })()`);
 for(const [name,ratio]of Object.entries(contrast))assert.ok(ratio>=4.5,`${theme}/${name}: contrast ${ratio}`);
 console.log(JSON.stringify({theme,contrast}));
}
await evaluate(`document.querySelector('#themeToggle').click();location.reload()`);await pause(200);assert.equal(await evaluate(`document.documentElement.dataset.theme`),'light');assert.deepEqual(errors,[]);
console.log(JSON.stringify({result:'passed',layouts:checks.length,checks:['light/dark','PC/mobile/narrow/tablet','dialog bounds','text contrast >=4.5','theme persistence'],screenshots:'outputs/themes/'}));ws.close();
