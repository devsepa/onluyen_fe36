import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQuizSound} from '../dist/quiz-sound.mjs';
test('correct and incorrect feedback use different quiet tones; mute persists and creates no audio',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},notes=[],levels=[];let contexts=0;
 const makeContext=()=>{contexts++;return {state:'running',currentTime:10,destination:{},createOscillator:()=>({frequency:{setValueAtTime:f=>notes.push(f)},connect(){},start(){},stop(){},disconnect(){}}),createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime:v=>levels.push(v),exponentialRampToValueAtTime(){}},connect(){},disconnect(){}})}};
 const sound=createQuizSound({storage,makeContext});sound.play(true);assert.deepEqual(notes,[660,880]);sound.play(false);assert.deepEqual(notes,[660,880,220,165]);assert.equal(contexts,1);assert.ok(levels.every(v=>v<=.06));
 sound.toggle();sound.play(true);assert.equal(notes.length,4);assert.equal(values.get('sot-sound'),'false');const restored=createQuizSound({storage,makeContext});assert.equal(restored.enabled,false);restored.play(false);assert.equal(contexts,1);
});
test('unsupported audio and unavailable storage never prevent answering',()=>{
 const sound=createQuizSound({storage:{getItem(){throw Error('Unavailable')},setItem(){throw Error('Unavailable')}},makeContext(){throw Error('Unsupported')}});assert.doesNotThrow(()=>sound.play(true));assert.doesNotThrow(()=>sound.toggle());
});
