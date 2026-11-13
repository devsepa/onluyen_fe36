import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeQuestionBanks} from '../dist/bank-merge.mjs';
const q=(source,slide,extra={})=>({id:source+slide,sourceId:source,sourceName:source,slide,url:`https://docs.google.com/presentation/d/${source}/edit#slide=id.p${slide}`,answer:'A',explanation:'',...extra});
test('three subjects accumulate and importing a subset never removes saved slides',()=>{
 const first=[q('DBI202',1),q('DBI202',2)];
 const second=mergeQuestionBanks(first,[q('JPD113',1)]);
 const third=mergeQuestionBanks(second,[q('PRN212',1)]);
 assert.equal(third.length,4);assert.equal(first.length,2);
 assert.equal(mergeQuestionBanks(third,[q('DBI202',1,{id:'new-id'})]).length,4);
 assert.ok(third.some(q=>q.id==='DBI2022'));
});
test('repeat imports preserve edited answers, ids, verification and explanations',()=>{
 const saved=q('DBI202',1,{answer:'AC',answerSource:'manual',verified:true,explanation:'Reviewed'});
 const merged=mergeQuestionBanks([saved],[q('DBI202',1,{id:'random',answer:'B',explanation:'New suggestion'})]);
 assert.deepEqual(merged,[saved]);
 assert.equal(mergeQuestionBanks([q('DBI202',2,{answer:'',answerSource:'manual'})],[q('DBI202',2)])[0].answer,'');
});
test('fills missing answers and matching explanations without duplicating a question',()=>{
 const old=q('DBI202',1,{answer:''});
 const result=mergeQuestionBanks([old],[q('DBI202',1,{id:'regenerated',answer:'B',verified:true,explanation:'Notes'})]);
 assert.equal(result.length,1);assert.equal(result[0].id,old.id);assert.equal(result[0].answer,'B');assert.equal(old.answer,'');
 const conflict=mergeQuestionBanks([q('DBI202',2)],[q('DBI202',2,{answer:'B',explanation:'Wrong for A'})]);assert.equal(conflict[0].explanation,'');
});
test('shared decks deduplicate by deck/index and resolve conflicting ids across sources',()=>{
 const shared={id:'same',sourceId:'shared-abc',sharedDeck:'abc',sharedIndex:0,answer:'A'};
 const result=mergeQuestionBanks([shared],[{...shared,id:'new'},q('JPD113',1,{id:'same'})]);
 assert.equal(result.length,2);assert.notEqual(result[1].id,'same');assert.equal(result[0].id,'same');
});
