import test from 'node:test';
import assert from 'node:assert/strict';
import {labelsFromImageText,resizeQuestionChoices} from '../dist/question-choices.mjs';
import {cleanQuestion,answerQuestion,confirmQuestion,grade,detailsFromNotes} from '../dist/core.mjs';
const q={id:'dns',stem:'Choose two.',extraction:'ocr',answer:'CD',verified:true,answerSource:'speaker-notes',options:'ABCD'.split('').map(id=>({id,text:''}))};
test('reads five through eight explicit image labels without guessing missing letters',()=>{
 for(let n=5;n<=8;n++){const labels='ABCDEFGH'.slice(0,n).split('');assert.deepEqual(labelsFromImageText('Choose two.\n'+labels.map(l=>l+'. original choice').join('\n')),labels)}
 assert.deepEqual(labelsFromImageText('A. One\nC. Three\nE. Five'),[]);assert.deepEqual(labelsFromImageText('Choose five options'),[]);
 assert.deepEqual(labelsFromImageText('A. authentication\nB. repudiation\nC. availability\nD. accounting\nE. authorization\nf access'),'ABCDEF'.split(''));
 assert.deepEqual(labelsFromImageText('A. One\nB. Two\nC. Three\nD. Four\nF. Six'),'ABCDEF'.split(''));
 assert.deepEqual(labelsFromImageText('[a] one\n[b] two\n[c] three'),['A','B','C']);
});
test('expanding image choices preserves source answer and exact-set multi scoring',()=>{
 const repaired=resizeQuestionChoices(q,5);assert.equal(repaired.answer,'CD');assert.equal(repaired.verified,true);assert.equal(repaired.answerSource,'speaker-notes');
 const s={mode:'study',questions:[repaired],answers:{},current:0,wrongAttemptLimit:0};answerQuestion(s,'dns','C');answerQuestion(s,'dns','E');assert.equal(s.answers.dns,undefined);confirmQuestion(s,'dns');assert.equal(grade(s.questions,s.answers),0);
 const exam={mode:'exam',questions:[repaired],answers:{},deadline:Date.now()+60000};answerQuestion(exam,'dns','C');answerQuestion(exam,'dns','D');assert.equal(grade(exam.questions,exam.answers),1);answerQuestion(exam,'dns','E');assert.equal(grade(exam.questions,exam.answers),0);
});
test('cleaning old image placeholders keeps E-H note answers instead of clearing them',()=>{
 const repaired=cleanQuestion({...q,answer:'AEH'});assert.equal(repaired.answer,'AEH');assert.equal(repaired.options.length,8);assert.equal(repaired.verified,true);
 assert.throws(()=>resizeQuestionChoices(repaired,5));assert.throws(()=>resizeQuestionChoices(q,1));assert.throws(()=>resizeQuestionChoices(q,9));
 assert.equal(cleanQuestion(resizeQuestionChoices({...q,answer:'AB'},2)).options.length,2,'manual 2-choice correction survives normalization');
 const native={...q,options:q.options.map(o=>({...o,text:'Authored text'})),answer:'AE'};assert.equal(cleanQuestion(native).answer,'','do not invent new native choices');
 const notes={slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'n'},pageElements:[{objectId:'n',shape:{text:{textElements:[{textRun:{content:'ACE\nOriginal explanation.'}}]}}}]}}};
 assert.equal(detailsFromNotes(notes,'ABCDEFGH'.split('').map(id=>({id,text:''}))).answer,'ACE');
});
