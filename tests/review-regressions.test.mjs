import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanSlideContent,cleanQuestion,updateQuestionContent} from '../dist/core.mjs';
import {createSlideImageStore} from '../dist/slide-images.mjs';
test('cleanup preserves question numbers, semester wording and international names',()=>{
 const text='How many weeks are in a semester?\n200\nNinh lives in Hà Nội.\nSELECT 1 FROM semester_results;\nA. 100\nB. 200';
 assert.equal(cleanSlideContent(text),text);
 assert.equal(cleanSlideContent('B. Señor Álvarez'),'B. Señor Álvarez');
});
test('cleaning does not add choices to a fully parsed two-option question',()=>{
 const q=cleanQuestion({stem:'Question?',options:[{id:'A',text:'Yes'},{id:'B',text:'No'}],answer:'D',verified:true});
 assert.deepEqual(q.options.map(o=>o.id),['A','B']);assert.equal(q.answer,'');assert.equal(q.verified,false);
});
test('cluster edits update the same stem and choices sent to AI',()=>{
 const before={stem:'Old?',content:'Old?\nA. Old first\nB. Old second',options:[{id:'A',text:'Old first'},{id:'B',text:'Old second'}]};
 const updated=updateQuestionContent(before,'Updated?\nA. SELECT 1\nB. SELECT 2');
 assert.equal(updated.stem,'Updated?');assert.equal(updated.options[1].text,'SELECT 2');assert.equal(updated.content,'Updated?\nA. SELECT 1\nB. SELECT 2');assert.equal(before.options[1].text,'Old second');
 assert.throws(()=>updateQuestionContent(before,'Missing the choices'),/nhãn/);
});
test('image cache shares pending loads, releases evicted blobs and ignores requests after logout',async()=>{
 let loads=0;const revoked=[],store=createSlideImageStore(async q=>{loads++;return 'blob:'+q.url},{limit:1,revoke:url=>revoked.push(url)});
 assert.deepEqual(await Promise.all([store.get({url:'s1'}),store.get({url:'s1'})]),['blob:s1','blob:s1']);assert.equal(loads,1);
 await store.get({url:'s2'});assert.ok(revoked.includes('blob:s1'));store.clear();assert.ok(revoked.includes('blob:s2'));
 let finish;const pending=new Promise(r=>{finish=r}),late=createSlideImageStore(()=>pending,{revoke:url=>revoked.push(url)});
 const result=late.get({url:'late'});late.clear();finish('blob:late');await assert.rejects(()=>result);assert.ok(revoked.includes('blob:late'));
});
