import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleReadQueue,waitAbortable,abortableResult} from '../dist/google-read-queue.mjs';
test('simultaneous thumbnail readers share one paced queue below 60 reads/minute',async()=>{
 let clock=0;const starts=[],waits=[],queue=createGoogleReadQueue({now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms}});
 await Promise.all(Array.from({length:5},()=>queue.reserve().then(()=>starts.push(clock))));assert.deepEqual(starts,[0,1200,2400,3600,4800]);assert.ok(waits.every(ms=>ms>=1200));
});
test('Google 429 cooldown delays all readers, not just the failing upload',async()=>{
 let clock=0;const waits=[],queue=createGoogleReadQueue({now:()=>clock,sleep:async ms=>{waits.push(ms);clock+=ms}});await queue.reserve();queue.pause(60000);await Promise.all([queue.reserve(),queue.reserve()]);assert.deepEqual(waits,[60000,1200]);
});
test('cancelling a queued request does not poison the queue and waits can be aborted',async()=>{
 let clock=0;const queue=createGoogleReadQueue({now:()=>clock,sleep:async(ms,signal)=>{if(signal?.aborted)throw new DOMException('Stopped','AbortError');clock+=ms}});await queue.reserve();const controller=new AbortController();controller.abort();await assert.rejects(()=>queue.reserve(controller.signal),{name:'AbortError'});await queue.reserve();assert.equal(clock,1200);
 const waiting=new AbortController(),promise=waitAbortable(60000,waiting.signal);waiting.abort();await assert.rejects(()=>promise,{name:'AbortError'});
 const shared=new AbortController(),result=abortableResult(new Promise(()=>{}),shared.signal);shared.abort();await assert.rejects(()=>result,{name:'AbortError'});
});
