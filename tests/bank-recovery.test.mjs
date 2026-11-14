import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteQuestionsSafely,recoverableQuestions} from '../dist/bank-recovery.mjs';
import {subjectKey} from '../dist/subjects.mjs';
import {mergeQuestionBanks} from '../dist/bank-merge.mjs';
const question=(sourceName,slide)=>({id:sourceName+slide,sourceId:sourceName,sourceName,slide,url:`https://docs.google.com/presentation/d/${sourceName}/edit#slide=id.p${slide}`,stem:'原文 câu hỏi',options:[{id:'A',text:'Một'},{id:'B',text:'Hai'}],answer:'AB',explanation:'Giải thích gốc',mediaId:'a'.repeat(64)});
function fixture(){let bank=[question('semester_DBI202',1),question('other_DBI202',2),question('JPD113',1)];const records=[];return {getBank:()=>bank,setBank:value=>{bank=value;return true},archive:async(questions,label)=>records.push(structuredClone({questions,label})),confirm:async()=>true,select:q=>subjectKey(q)==='DBI202',label:'DBI202',records}}
test('deleting a subject archives all its documents and preserves other subjects and original content',async()=>{
 const context=fixture();await deleteQuestionsSafely(context);
 assert.equal(context.getBank().length,1);assert.equal(subjectKey(context.getBank()[0]),'JPD113');
 assert.equal(context.records[0].questions.length,2);assert.equal(context.records[0].questions[0].answer,'AB');assert.equal(context.records[0].questions[0].stem,'原文 câu hỏi');assert.equal(context.records[0].questions[0].mediaId,'a'.repeat(64));
});
test('cancel and blocked active sessions never archive or delete',async()=>{
 for(const overrides of [{confirm:async()=>false},{canChange:()=>false}]){const ctx=fixture();assert.equal(await deleteQuestionsSafely({...ctx,...overrides}),false);assert.equal(ctx.getBank().length,3);assert.equal(ctx.records.length,0)}
});
test('archive quota failure keeps the complete original bank',async()=>{
 const ctx=fixture(),original=ctx.getBank();await assert.rejects(deleteQuestionsSafely({...ctx,archive:async()=>{throw Error('quota')}}),/quota/);assert.equal(ctx.getBank(),original);
});
test('concurrent imports and in-place edits during archive prevent stale deletion',async()=>{
 for(const change of [ctx=>ctx.setBank([...ctx.getBank(),question('PRN212',1)]),ctx=>{ctx.getBank()[0].explanation='Edited'}]){
  const ctx=fixture();await assert.rejects(deleteQuestionsSafely({...ctx,archive:async()=>change(ctx)}),/vừa thay đổi/);assert.ok(ctx.getBank().some(q=>subjectKey(q)==='DBI202'));
 }
});
test('recovery from history is deduplicated and never overwrites newer manual content',()=>{
 const ctx=fixture(),old=ctx.getBank()[0],current={...old,answer:'B',explanation:'Manually edited'};
 const missing=recoverableQuestions([current],[old,old,ctx.getBank()[2],null,{}]);assert.equal(missing.length,1);
 const restored=mergeQuestionBanks([current],missing);assert.equal(restored.length,2);assert.equal(restored[0].answer,'B');assert.equal(restored[0].explanation,'Manually edited');assert.equal(recoverableQuestions(restored,[old,...missing]).length,0);
});
test('failed bank write leaves recovery record available',async()=>{
 const ctx=fixture();await assert.rejects(deleteQuestionsSafely({...ctx,setBank:()=>false}),/Chưa lưu/);assert.equal(ctx.records.length,1);assert.equal(ctx.getBank().length,3);
});
