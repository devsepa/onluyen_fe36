import test from 'node:test';
import assert from 'node:assert/strict';
import {nextUnanswered,explanationFromResult} from '../dist/study-flow.mjs';
test('skip answered questions and wrap without submitting',()=>{
 const s={current:1,questions:[1,2,3,4,5].map(id=>({id})),answers:{1:'B',2:'A',3:'C',4:'D'}};
 assert.equal(nextUnanswered(s),4);
 s.current=4;delete s.answers[2];assert.equal(nextUnanswered(s),1);
 s.answers[2]='A';s.answers[5]='A';assert.equal(nextUnanswered(s),-1);
});
test('never apply an explanation that conflicts with the original answer',()=>{
 const q={answer:'AC'};
 assert.equal(explanationFromResult(q,{status:'answered',answer:'CA',explanation:' Reason '}),'Reason');
 assert.throws(()=>explanationFromResult(q,{status:'answered',answer:'B',explanation:'Wrong'}),/khác đáp án gốc/);
 assert.throws(()=>explanationFromResult(q,{status:'uncertain',answer:'',explanation:'Unsure'}));
 assert.equal(q.answer,'AC');
});
