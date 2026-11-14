import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQuizSound} from '../dist/quiz-sound.mjs';
test('correct and incorrect feedback use different quiet tones; mute persists and creates no audio',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},notes=[],levels=[];let contexts=0;
 const makeContext=()=>{contexts++;return {state:'running',currentTime:10,destination:{},createOscillator:()=>({frequency:{setValueAtTime:f=>notes.push(f)},connect(){},start(){},stop(){},disconnect(){}}),createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime:v=>levels.push(v),exponentialRampToValueAtTime(){}},connect(){},disconnect(){}})}};
 const sound=createQuizSound({storage,makeContext});
 sound.play(true);assert.deepEqual(notes,[1318,1661,1975]);
 sound.play(false);assert.deepEqual(notes,[1318,1661,1975,880,830]);
 assert.equal(contexts,1);assert.ok(levels.every(v=>v<=0.065));
 sound.toggleSound();sound.play(true);assert.equal(notes.length,5);assert.equal(values.get('sot-sound'),'false');
 const restored=createQuizSound({storage,makeContext});assert.equal(restored.enabled,false);restored.play(false);assert.equal(contexts,1);
});
test('unsupported audio and unavailable storage never prevent answering',()=>{
 const sound=createQuizSound({storage:{getItem(){throw Error('Unavailable')},setItem(){throw Error('Unavailable')}},makeContext(){throw Error('Unsupported')}});
 assert.doesNotThrow(()=>sound.play(true));assert.doesNotThrow(()=>sound.toggleSound());
});
