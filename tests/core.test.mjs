import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePresentation,grade,shuffle,answerQuestion,optionState} from '../dist/core.mjs';
const shape=(id,text)=>({objectId:id,shape:{text:{textElements:[{textRun:{content:text}}]}}});
test('reads grouped questions and speaker notes, leaves imported answer unverified',()=>{const p={presentationId:'abc',slides:[{objectId:'s1',pageElements:[{elementGroup:{children:[shape('q','What is an index?\nA. Fast lookup\nB. Alias')]}}],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'note'},pageElements:[shape('number','1'),shape('note','Answer: A\n')]}}},{objectId:'s2',pageElements:[{image:{}}]}]};const r=parsePresentation(p);assert.equal(r.questions.length,1);assert.equal(r.questions[0].answer,'A');assert.equal(r.questions[0].verified,false);assert.equal(r.questions[0].options[1].text,'Alias');assert.deepEqual(r.skipped,[2]);});
test('ambiguous notes never create a guessed answer',()=>{const r=parsePresentation({slides:[{pageElements:[shape('q','Question\nA. One\nB. Two')],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'n'},pageElements:[shape('n','A or B')]}}}]});assert.equal(r.questions[0].answer,'')});
test('grade uses stable option identifiers after shuffling',()=>{const q={id:'q',answer:'B',options:shuffle([{id:'A'},{id:'B'}])};assert.equal(grade([q],{q:'B'}),1);assert.equal(grade([q],{}),0);assert.equal(grade([q],{q:'A'}),0);assert.equal(q.options.length,2)});
const makeSession=mode=>({mode,questions:[{id:'q',answer:'B',options:[{id:'B'},{id:'A'}]}],answers:{},deadline:mode==='study'?null:2000,done:false});
test('study immediately shows correct and wrong choices, locks first answer, survives reload',()=>{const s=makeSession('study'),q=s.questions[0];assert.equal(optionState(s,q,'B'),'');assert.equal(answerQuestion(s,'q','A',5000),true);assert.equal(optionState(s,q,'A'),'wrong');assert.equal(optionState(s,q,'B'),'correct');const restored=JSON.parse(JSON.stringify(s));assert.equal(answerQuestion(restored,'q','B',6000),false);assert.equal(grade(restored.questions,restored.answers),0);assert.equal(optionState(restored,q,'B'),'correct')});
test('exam hides correctness and permits changing answers until deadline',()=>{const s=makeSession('exam'),q=s.questions[0];assert.equal(answerQuestion(s,'q','A',1000),true);assert.equal(optionState(s,q,'A'),'selected');assert.equal(optionState(s,q,'B'),'');assert.equal(answerQuestion(s,'q','B',1500),true);assert.equal(optionState(s,q,'B'),'selected');assert.equal(answerQuestion(s,'q','A',2000),false);assert.equal(grade(s.questions,s.answers),1)});
test('completed sessions and invalid choices cannot be changed',()=>{const s=makeSession('study');assert.equal(answerQuestion(s,'q','C',1000),false);assert.equal(answerQuestion(s,'missing','A',1000),false);s.done=true;assert.equal(answerQuestion(s,'q','A',1000),false)});
test('reads soft line breaks, lowercase and bracketed answer labels',()=>{
 for(const text of ['Question?\va. One\vb. Two','Question?\r(A) One\r(B) Two','Question?\n[A] One\n[B] Two','Question? A. One B. Two']){
  const r=parsePresentation({slides:[{pageElements:[shape('q',text)]}]});assert.equal(r.questions.length,1,text);assert.equal(r.questions[0].options[0].text,'One');assert.equal(r.questions[0].options[1].id,'B');
 }
});
test('orders separate text boxes by slide position instead of stacking order',()=>{
 const r=parsePresentation({slides:[{pageElements:[{...shape('b','B. Two'),transform:{translateY:300}},{...shape('stem','Question?'),transform:{translateY:10}},{...shape('a','A. One'),transform:{translateY:200}}]}]});
 assert.equal(r.questions.length,1);assert.equal(r.questions[0].stem,'Question?');
});
test('reports image-only slides and unrecognized text without inventing questions',()=>{
 const r=parsePresentation({slides:[{pageElements:[{elementGroup:{children:[{image:{}}]}}]},{pageElements:[shape('title','Introduction')]},{pageProperties:{pageBackgroundFill:{stretchedPictureFill:{}}}}]});
 assert.equal(r.questions.length,0);assert.equal(r.diagnostics.totalSlides,3);assert.equal(r.diagnostics.textSlides,1);assert.equal(r.diagnostics.imageSlides,2);assert.equal(r.diagnostics.pages[1].preview,'Introduction');
});
