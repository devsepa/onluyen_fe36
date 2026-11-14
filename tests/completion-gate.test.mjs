import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompletionGate} from '../dist/completion-gate.mjs';
const session=()=>({mode:'study',answers:{q:'A'},questions:[{id:'q',answer:'A'}],done:false});
test('manual completion waits for a win, blocks double clicks, and saves before opening the game',async()=>{
 const current=session(),events=[];let resolveGame,finished=0;const gate=createCompletionGate({getSession:()=>current,saveSession:()=>{events.push('save');return true},play:options=>{events.push('play');assert.equal(options.answered,1);return new Promise(r=>resolveGame=r)},complete:()=>{current.done=true;finished++;gate.cancel()}});
 const pending=gate.request();assert.deepEqual(events,['save','play']);assert.equal(gate.active,true);assert.equal(await gate.request(),false);assert.equal(finished,0);resolveGame(true);assert.equal(await pending,true);assert.equal(finished,1);assert.equal(gate.active,false);
});
test('dodging is saved once for this session and reopening does not repeat the prank',async()=>{
 const current=session();let count=0,saves=0;const gate=createCompletionGate({getSession:()=>current,saveSession:()=>{saves++;return true},play:async options=>{count++;if(count===1){assert.equal(options.alreadyDodged,false);options.onDodge();return false}assert.equal(options.alreadyDodged,true);return false},complete:()=>assert.fail('Cancelled game cannot finish')});
 await gate.request();assert.equal(current.completionDodgeUsed,true);await gate.request();assert.equal(saves,3);assert.equal(current.answers.q,'A');
});
test('automatic deadline cancellation aborts the game and stale win cannot finish twice',async()=>{
 let current={...session(),mode:'exam',deadline:9999},resolveGame,signal,finished=0;const gate=createCompletionGate({now:()=>1,getSession:()=>current,saveSession:()=>true,play:options=>{signal=options.signal;return new Promise(r=>resolveGame=r)},complete:()=>{finished++}});
 const pending=gate.request();gate.cancel();current.done=true;finished++;resolveGame(true);assert.equal(await pending,false);assert.equal(signal.aborted,true);assert.equal(finished,1);
});
test('a session that has already expired submits without loading the game',async()=>{
 let finished=0;const gate=createCompletionGate({now:()=>100,getSession:()=>({...session(),mode:'exam',deadline:99}),saveSession:()=>assert.fail('No delayed submission'),play:()=>assert.fail('No game after deadline'),complete:()=>finished++});assert.equal(await gate.request(),true);assert.equal(finished,1);
});
test('save failure prevents the game and a stale session cannot be completed by its old promise',async()=>{
 const blocked=createCompletionGate({getSession:session,saveSession:()=>false,play:()=>assert.fail('Must save first'),complete:()=>assert.fail('No finish')});assert.equal(await blocked.request(),false);
 let current=session(),resolveGame;const gate=createCompletionGate({getSession:()=>current,saveSession:()=>true,play:()=>new Promise(r=>resolveGame=r),complete:()=>assert.fail('Old game cannot finish new session')});const pending=gate.request();current=session();resolveGame(true);assert.equal(await pending,false);
});
test('a genuine loading failure offers an explicit fallback but never finishes silently',async()=>{
 let finished=0;const current=session(),gate=createCompletionGate({getSession:()=>current,saveSession:()=>true,play:async()=>{throw Error('Offline asset')},onError:async()=>false,complete:()=>finished++});assert.equal(await gate.request(),false);assert.equal(finished,0);
 const fallback=createCompletionGate({getSession:()=>current,saveSession:()=>true,play:async()=>{throw Error('No canvas')},onError:async()=>true,complete:()=>finished++});assert.equal(await fallback.request(),true);assert.equal(finished,1);
});
