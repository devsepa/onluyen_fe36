import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(tmpdir(),'fe36-layout-'));
const server=spawn(process.execPath,['scripts/serve.mjs'],{stdio:'inherit'});
const browser=spawn(process.env.CHROME_BIN||'google-chrome',['--headless=new','--no-sandbox','--disable-background-networking','--disable-extensions','--no-default-browser-check','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--remote-debugging-port=9223','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
let browserError,diagnostics='' ;browser.stderr.on('data',chunk=>{diagnostics=(diagnostics+chunk).slice(-4000)});browser.on('error',error=>browserError=error);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;for(let i=0;i<180;i++){if(browserError)throw browserError;if(browser.exitCode!==null)throw Error('Chrome exited: '+diagnostics);try{const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json();if(pages.some(p=>p.type==='page')){ready=true;break}}catch{}await sleep(250)}if(!ready)throw Error('QA browser did not start: '+diagnostics);
 for(const script of ['browser-question-choices-qa.mjs','browser-mode-colors-qa.mjs','browser-import-review-qa.mjs','browser-exam-simulation-qa.mjs','browser-practice-scope-qa.mjs','browser-result-report-qa.mjs','browser-source-actions-qa.mjs'])await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/'+script],{stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(script+' failed: '+code)))});
}finally{browser.kill();server.kill();await sleep(300);await rm(profile,{recursive:true,force:true})}
