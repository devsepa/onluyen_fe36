import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSlideReview,needsSlideReview,manualReviewQuestion} from '../dist/import-review-data.mjs';
const slide=(objectId,note='')=>({objectId,pageElements:[{image:{}}],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'n'},pageElements:[{objectId:'n',shape:{text:{textElements:[{textRun:{content:note}}]}}}]}}});
test('review reports retain skipped, unread and unknown slides instead of only imported questions',()=>{
 const p={presentationId:'source',title:'DBI202',revisionId:'v1',slides:[slide('a','AE'),slide('b'),slide('c'),slide('d'),slide('e')]};
 const parsed={questions:[{slide:1,stem:'Original',options:'ABCD'.split('').map(id=>({id,text:''})),answer:'AE'}],diagnostics:{pages:[{slide:1,classification:'question'},{slide:2,classification:'uncertain',importError:'Image request failed'},{slide:4,classification:'other'}]}};
 const report=buildSlideReview(p,parsed,{}, {endSlide:4});assert.deepEqual(report.slides.map(r=>r.status),['check','unknown','unread','skipped','outside']);assert.equal(report.slides[1].reason,'Image request failed');assert.equal(report.slides[0].question.answer,'AE');assert.equal(report.slides[0].question.options.length,5);assert.ok(report.slides[2].url.endsWith('id.c'));assert.equal(report.version,'v1');
 assert.equal(needsSlideReview(report.slides[0]),true);assert.equal(needsSlideReview(report.slides[3]),false);assert.equal(needsSlideReview({...report.slides[3],imageStatus:'error'}),true);
});
test('manual approval requires full answer labels and either a loaded image or complete choices',()=>{
 const row=buildSlideReview({presentationId:'private',slides:[slide('q')]},{diagnostics:{pages:[]}}).slides[0],options='ABCDE'.split('').map(id=>({id,text:''}));
 assert.throws(()=>manualReviewQuestion(row,{stem:'Original',options,answer:'AE'}),/Ảnh/);
 const q=manualReviewQuestion({...row,imageStatus:'ok'},{stem:'Original 日本語',options,answer:'A, E',explanation:'Separate reason'});assert.equal(q.answer,'AE');assert.equal(q.verified,true);assert.equal(q.answerSource,'manual');assert.equal(q.options.length,5);assert.equal(q.stem,'Original 日本語');assert.equal(q.explanation,'Separate reason');assert.equal(q.explanationDetails,undefined);
 assert.throws(()=>manualReviewQuestion({...row,imageStatus:'ok'},{stem:'Original',options,answer:'AH'}));
 const typed=manualReviewQuestion(row,{stem:'Original',options:options.map(o=>({...o,text:'Full original choice '+o.id})),answer:'AE'});assert.equal(typed.verified,true);
});
