import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewQueue,relatedQuestions,mapQuestions,questionType} from '../dist/learning-loop.mjs';
const q=(id,overrides={})=>({id,sourceId:'sql',sourceName:'DBI202',stem:'SELECT name WHERE age > 20',options:[{id:'A',text:'WHERE'},{id:'B',text:'JOIN'}],answer:'A',...overrides});
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)}};
test('review queue persists wrong and skipped questions, removes mastered exact-set answers and ignores reopened results',()=>{
 const store=storage(),queue=createReviewQueue(store),questions=[q('a'),q('b'),q('c',{answer:'AB'})];
 const result={id:'first',questions,answers:{a:'B',c:'A'}};queue.record(result);assert.equal(queue.questions().length,3);
 const restored=createReviewQueue(store);restored.mastered(questions[0]);assert.deepEqual(restored.questions().map(q=>q.id),['b','c']);
 restored.record(result);assert.equal(restored.questions().length,2);
 restored.record({id:'retry',reviewQueue:true,questions:questions.slice(1),answers:{b:'A',c:'AB'}});assert.equal(restored.questions().length,0);
});
test('a correct ordinary attempt does not erase a pending review; failed writes preserve in-memory queue',()=>{
 const store=storage(),queue=createReviewQueue(store),question=q('a');queue.record({id:'first',questions:[question],answers:{a:'B'}});
 queue.record({id:'second',questions:[question],answers:{a:'A'}});assert.equal(queue.questions().length,1);
 store.setItem=()=>{throw Error('full')};assert.throws(()=>queue.mastered(question));assert.equal(queue.questions().length,1);
});
test('related practice keeps source content and ordered choices, excludes original and other subjects',()=>{
 const question=q('a',{topic:'Filtering'}),related=q('b',{topic:'Filtering'}),other=q('c',{topic:'Filtering',sourceName:'JPD113'});
 assert.deepEqual(relatedQuestions(question,[question,related,other]),[related]);assert.equal(questionType({stem:'Unknown question'}),'');
 assert.equal(relatedQuestions({id:'unknown'},[related]).length,0);
});
test('question map filters keep original indexes for unanswered and flagged navigation',()=>{
 const session={questions:[q('a'),q('b'),q('c')],answers:{a:'A'},flags:['a','c']};
 assert.deepEqual(mapQuestions(session,'unanswered').map(x=>x.index),[1,2]);assert.deepEqual(mapQuestions(session,'flagged').map(x=>x.index),[0,2]);
});
