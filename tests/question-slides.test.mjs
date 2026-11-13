import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectQuestionSlides,fastSlideKind} from '../dist/question-slides.mjs';
import {applyAiResults,solveBatch} from '../dist/ai.mjs';
import {validateResults} from '../backend/worker.mjs';
const shape=text=>({shape:{text:{textElements:[{textRun:{content:text}}]}}});
const slide=(id,{text='',note='',image=true}={})=>({objectId:id,pageElements:[...(text?[shape(text)]:[]),...(image?[{image:{contentUrl:'https://example/image.png'}}]:[])],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'note'},pageElements:[{...shape(note),objectId:'note'}]}}});
const p=slides=>({presentationId:'private',slides});
test('skips introductions, link lists and promotions; accepts original question images with notes, keeping slide numbers',async()=>{
 const input=p([slide('intro',{text:'Welcome',image:false}),slide('links',{text:'Link tìm hiểu về 2NF:\nhttps://youtu.be/example'}),slide('ad',{text:'Các khóa học · Link website ForUser'}),slide('q',{note:'BC\nGiải thích'}),slide('q2',{note:'D'})]);
 let calls=0;const result=await selectQuestionSlides(input,{inspect:async()=>{calls++;throw Error('Must not inspect known pages')}});
 assert.deepEqual(result.questions.map(q=>q.slide),[4,5]);assert.deepEqual(result.skipped,[1,2,3]);assert.equal(calls,0);assert.equal(result.questions[0].answer,'BC');assert.equal(result.questions[0].explanation,'Giải thích');assert.ok(result.questions[0].url.endsWith('id.q'));
});
test('unknown image must be a genuine visual question, not merely a placeholder A/B/C/D',async()=>{
 const result=await selectQuestionSlides(p([slide('advert'),slide('unreadable'),slide('question')]),{inspect:async q=>({model:'vision',result:q.slide===1?{kind:'other',status:'uncertain',answer:'',labels:[]}:q.slide===2?{kind:'uncertain',status:'uncertain',answer:'',labels:[]}:{kind:'question',status:'answered',answer:'AE',labels:['A','B','C','D','E'],explanation:'AI explanation'}})});
 assert.deepEqual(result.questions.map(q=>q.slide),[3]);assert.deepEqual(result.skipped,[1]);assert.deepEqual(result.unresolved,[2]);assert.equal(result.questions[0].answerSource,'gemini');assert.equal(result.questions[0].verified,false);assert.equal(result.questions[0].answer,'AE');assert.deepEqual(result.questions[0].options.map(o=>o.id),['A','B','C','D','E']);
});
test('native structured questions remain accepted even if question text references a website',async()=>{
 const result=await selectQuestionSlides(p([slide('q',{text:'Which URL is correct? https://youtu.be/example\nA. First\nB. Second',image:false})]));assert.equal(result.questions.length,1);assert.equal(result.questions[0].stem,'Which URL is correct? https://youtu.be/example');
 assert.equal(fastSlideKind({preview:'A: link\nB: link',images:1},{options:[{id:'A',text:''},{id:'B',text:''}]},{}),'inspect');
});
test('disabled or unavailable AI never turns unknown images into questions and does not discard note-backed questions',async()=>{
 const input=p([slide('unknown'),slide('valid',{note:'A'}),slide('unknown2')]);const without=await selectQuestionSlides(input);assert.deepEqual(without.questions.map(q=>q.slide),[2]);assert.deepEqual(without.unresolved,[1,3]);
 let calls=0;const failed=await selectQuestionSlides(input,{inspect:async()=>{calls++;throw Error('Quota')}});assert.equal(calls,1);assert.deepEqual(failed.questions.map(q=>q.slide),[2]);
});
test('question limit counts accepted questions only and cancellation never commits an in-flight classification',async()=>{
 const result=await selectQuestionSlides(p([slide('ad',{text:'Các khóa học'}),slide('q1',{note:'A'}),slide('q2',{note:'B'})]),{maxQuestions:1});assert.deepEqual(result.questions.map(q=>q.slide),[2]);assert.deepEqual(result.diagnostics.unread,[3]);
 const controller=new AbortController();await assert.rejects(()=>selectQuestionSlides(p([slide('unknown')]),{signal:controller.signal,inspect:async()=>{controller.abort();return {result:{kind:'question',labels:['A','B']}}}}),{name:'AbortError'});
});
test('existing bank removes AI-confirmed non-question images but never deletes changed or answered questions',()=>{
 const q={id:'q',stem:'Slide 9',url:'https://docs.google.com/presentation/d/private/edit#slide=id.s9',options:[{id:'A',text:''},{id:'B',text:''}],answer:''},submitted={...structuredClone(q),image:{mimeType:'image/png',data:'aGVsbG8='}},result={id:'q',kind:'other',labels:[],status:'uncertain',answer:'',explanation:'Advertisement'};
 const bank=[structuredClone(q)];applyAiResults(bank,[submitted],[result],'vision');assert.equal(bank.length,0);
 const answered=[{...q,answer:'A',answerSource:'speaker-notes'}];applyAiResults(answered,[submitted],[result],'vision');assert.equal(answered.length,1);
 const changed=[{...q,stem:'Edited'}];applyAiResults(changed,[submitted],[result],'vision');assert.equal(changed.length,1);
 assert.deepEqual(validateResults({answers:[result]},[submitted]),[result]);assert.throws(()=>validateResults({answers:[{...result,status:'answered',answer:'A'}]},[submitted]));
});
test('client rejects a classifier claiming an advertisement has a correct answer',async()=>{
 const q={id:'q',stem:'Slide',options:[{id:'A',text:''},{id:'B',text:''}],image:{mimeType:'image/png',data:'aGVsbG8='}};
 await assert.rejects(()=>solveBatch('https://worker.example',[q],'token',{fetcher:async()=>Response.json({model:'vision',answers:[{id:'q',kind:'other',labels:[],status:'answered',answer:'A',explanation:'Invalid'}]})}));
});
test('fast import never waits for AI on introductory images before hundreds of note-backed questions',async()=>{
 const input=p([...Array.from({length:9},(_,i)=>slide('intro-'+i)),...Array.from({length:386},(_,i)=>slide('q-'+i,{note:'A'}))]);let calls=0;
 const result=await selectQuestionSlides(input,{deferInspection:true,inspect:()=>{calls++;return new Promise(()=>{})}});
 assert.equal(calls,0);assert.equal(result.questions.length,386);assert.equal(result.deferred.length,9);assert.equal(result.questions[0].slide,10);assert.equal(result.questions.at(-1).slide,395);assert.ok(result.deferred.every(q=>q.slideKind==='pending'));
});
