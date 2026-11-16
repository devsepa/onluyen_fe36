import test from 'node:test';
import assert from 'node:assert/strict';
import {slideIssues,resultSummary} from '../dist/review-issues.mjs';
test('audit distinguishes unread image text from image loading failure',()=>{
 const row={status:'check',imageStatus:'ok',question:{stem:'Câu hỏi slide 3',options:[{id:'A',text:''},{id:'B',text:''}],answer:''}};
 assert.deepEqual(slideIssues(row).map(([id])=>id),['answer','content','choices']);
 assert.equal(slideIssues({...row,status:'skipped'}).length,0);
 assert.equal(slideIssues({...row,imageStatus:'error'})[0][0],'image');
});
test('result timing stops at deadline and wrong excludes unanswered',()=>{
 const r={mode:'exam',started:1000,finished:121000,deadline:61000,questions:[{id:'1',answer:'AD'},{id:'2',answer:'B'},{id:'3',answer:'A'}],answers:{1:'AD',2:'A'}};
 assert.deepEqual(resultSummary(r,(q,a)=>q.answer===a),{total:3,correct:1,wrong:1,unanswered:1,seconds:60,averageSeconds:20});
});
