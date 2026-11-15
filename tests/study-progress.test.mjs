import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionSummary,learningStats} from '../dist/study-progress.mjs';
import {createExplanationQueue} from '../dist/explanation-queue.mjs';
import {explanationKey} from '../dist/explanation-data.mjs';
const q=(id,answer='A')=>({id,sourceId:'dbi',sourceName:'DBI202',slide:Number(id),stem:'Question',answer,options:[{id:'A',text:'First'},{id:'B',text:'Second'}]});
test('resume summary counts only submitted answers and preserves expired exam deadlines',()=>{
 const s={questions:[q('1'),q('2')],current:1,mode:'exam',deadline:100,answers:{'1':'A'},drafts:{'2':'B'}};
 assert.deepEqual(sessionSummary(s,101),{title:'DBI202',total:2,answered:1,current:2,expired:true});assert.equal(sessionSummary({...s,done:true}),null);
});
test('analytics distinguishes final correctness, first try, skipped questions and chronological progress',()=>{
 const a=q('1','AB'),b=q('2');const stats=learningStats([{finished:200,questions:[a,b],answers:{'1':'A'},wrongAttempts:{'1':['B']}},{finished:100,questions:[a],answers:{'1':'AB'},wrongAttempts:{'1':['A','B']}}]);
 const g=stats.subjects[0];assert.equal(g.attempted,2);assert.equal(g.correct,1);assert.equal(g.firstTry,0);assert.equal(g.skipped,1);assert.deepEqual(g.scores,[100,0]);assert.equal(stats.weak.length,1);assert.equal(stats.weak[0].retries,3);assert.equal(stats.weak[0].wrong,1);
});
test('approved explanation replaces cached AI without another generation request',async()=>{
 const question=q('1'),queue=createExplanationQueue({load:()=>assert.fail('must not call AI')}),details={key:explanationKey(question),answer:'A',reviewed:true,reason:'Reviewed reason.',options:question.options.map(o=>({...o,reason:'Specific explanation.'}))};
 assert.equal(queue.adoptReviewed(question,{...details,reviewed:false}),false);assert.equal(queue.adoptReviewed(question,details),true);assert.deepEqual(await queue.request(question),details);queue.dispose();
});
