import test from 'node:test';
import assert from 'node:assert/strict';
import {answerQuestion,confirmQuestion,optionState,studyWrongLimit} from '../dist/core.mjs';
const q={id:'q',answer:'B',options:'ABCD'.split('').map(id=>({id,text:id}))};
const make=(limit=2,question=q)=>({mode:'study',questions:[structuredClone(question)],answers:{},drafts:{},wrongAttempts:{},wrongAttemptLimit:limit,done:false});
test('two wrong attempts stay editable and the third wrong attempt reveals and locks the answer',()=>{
 const s=make();for(const choice of ['A','C']){assert.equal(answerQuestion(s,'q',choice),true);assert.equal(s.answers.q,undefined);assert.equal(optionState(s,q,'B'),'');assert.equal(optionState(s,q,choice),'wrong')}
 assert.deepEqual(s.wrongAttempts.q,['A','C']);answerQuestion(s,'q','D');assert.equal(s.answers.q,'D');assert.equal(optionState(s,q,'B'),'correct');assert.equal(answerQuestion(s,'q','B'),false);
});
test('a correct answer reveals immediately, including after earlier failures',()=>{
 const first=make();answerQuestion(first,'q','B');assert.equal(first.answers.q,'B');assert.equal(first.wrongAttempts.q,undefined);const retry=make();answerQuestion(retry,'q','A');answerQuestion(retry,'q','B');assert.equal(retry.answers.q,'B');assert.equal(retry.wrongAttempts.q.length,1);
});
test('the configurable threshold counts repeated submissions; zero preserves immediate grading',()=>{
 for(const limit of [0,1,2,5]){const s=make(limit);for(let i=0;i<=limit;i++){answerQuestion(s,'q','A');assert.equal(!!s.answers.q,i===limit)}assert.equal(s.wrongAttempts.q.length,limit+1)}assert.equal(studyWrongLimit(make(-1)),0);assert.equal(studyWrongLimit(make(9)),0);
});
test('multi-answer choices do not count as attempts until explicit checking, then use exact sets',()=>{
 const multi={...q,answer:'BD'},s=make(2,multi);answerQuestion(s,'q','B');assert.equal(s.wrongAttempts.q,undefined);confirmQuestion(s,'q');assert.equal(s.answers.q,undefined);assert.deepEqual(s.wrongAttempts.q,['B']);assert.equal(optionState(s,multi,'D'),'');answerQuestion(s,'q','D');confirmQuestion(s,'q');assert.equal(s.answers.q,'BD');assert.equal(s.wrongAttempts.q.length,1);
});
test('invalid options and empty multi-answer checks do not consume attempts',()=>{
 const s=make();assert.equal(answerQuestion(s,'q','Z'),false);assert.equal(s.wrongAttempts.q,undefined);const multi=make(2,{...q,answer:'BD'});assert.equal(confirmQuestion(multi,'q'),false);assert.equal(multi.wrongAttempts.q,undefined);
});
test('attempts and remaining retries survive session serialization',()=>{
 let s=make();answerQuestion(s,'q','A');s=JSON.parse(JSON.stringify(s));answerQuestion(s,'q','C');assert.equal(s.answers.q,undefined);s=JSON.parse(JSON.stringify(s));answerQuestion(s,'q','D');assert.equal(s.answers.q,'D');assert.equal(s.wrongAttempts.q.length,3);
});
test('exam answers remain editable without attempt feedback or any correctness colors',()=>{
 const s={...make(),mode:'exam',deadline:Date.now()+100000};answerQuestion(s,'q','A');assert.equal(s.answers.q,'A');assert.equal(s.wrongAttempts.q,undefined);assert.equal(optionState(s,q,'B'),'');answerQuestion(s,'q','B');assert.equal(s.answers.q,'B');assert.equal(optionState(s,q,'B'),'selected');
});
