import test from 'node:test';
import assert from 'node:assert/strict';
import {solveBatch} from '../dist/ai.mjs';
import {aiRateLimitError} from '../dist/ai-rate-limit.mjs';
import {createExplanationQueue} from '../dist/explanation-queue.mjs';
const q=id=>({id,sourceId:'qa',url:'',stem:'Question '+id,options:[{id:'A',text:'First'},{id:'B',text:'Second'}],answer:'A'});
const details={answer:'A',reason:'Specific explanation',options:[{id:'A',text:'First',reason:'Correct condition'},{id:'B',text:'Second',reason:'Wrong condition'}]};
test('429 transport hides provider diagnostics, respects Retry-After, and never requests login',async()=>{
 await assert.rejects(solveBatch('https://ai.test',[q('1')],null,{fetcher:async()=>Response.json({error:'raw rate_limit_exceeded Gemini project details'},{status:429,headers:{'Retry-After':'120'}})}),error=>error.code==='AI_RATE_LIMITED'&&error.retryAfterSeconds===120&&!error.message.includes('Gemini')&&error.message.includes('Không cần đăng nhập lại'));
 assert.equal(aiRateLimitError(new Response('',{headers:{'Retry-After':new Date(120000).toUTCString()}}),0).retryAfterSeconds,120);
 assert.equal(aiRateLimitError(new Response('',{headers:{'Retry-After':'invalid'}}),0).retryAfterSeconds,60);
});
test('cooldown survives navigation, login resume, repeated clicks and reload while cached explanations stay usable',async()=>{
 let clock=0,calls=0,fail=false;const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const load=async()=>{calls++;if(fail)throw Object.assign(Error('Temporarily limited'),{status:429,retryAfterSeconds:120});return details};
 const queue=createExplanationQueue({storage,now:()=>clock,load});await queue.request(q('saved'));fail=true;await queue.request(q('limited'));assert.equal(calls,2);
 queue.cancel();queue.resume();await queue.request(q('other'),{retry:true});assert.equal(calls,2);assert.equal(queue.state(q('other')).retryAt,120000);
 const reloaded=createExplanationQueue({storage,now:()=>clock,load});await reloaded.request(q('other'),{retry:true});assert.equal(calls,2);
 assert.deepEqual(await reloaded.request(q('saved')),details);assert.equal(calls,2);
 clock=120001;fail=false;await reloaded.request(q('other'),{retry:true});assert.equal(calls,3);assert.equal(reloaded.state(q('other')).status,'ready');queue.dispose();reloaded.dispose();
});
