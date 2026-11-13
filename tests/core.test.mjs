import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePresentation,grade,shuffle,answerQuestion,optionState,cleanSlideContent,cleanQuestion,confirmQuestion,normalizeAnswer} from '../dist/core.mjs';
const shape=(id,text)=>({objectId:id,shape:{text:{textElements:[{textRun:{content:text}}]}}});
test('retains source SQL punctuation and placeholders verbatim instead of guessing missing OCR characters',()=>{
 const text='How to execute a procedure?\nA. EXECUTE name_sp <parameter>\nB. EXEC name_sp @value = \'x\'\nC. WHERE x <= 10 AND y <> 2\nD. name_sp <parameter=';
 const q=parsePresentation({slides:[{pageElements:[shape('q',text)]}]}).questions[0];
 assert.equal(q.options[0].text,'EXECUTE name_sp <parameter>');assert.equal(q.options[1].text,"EXEC name_sp @value = 'x'");assert.equal(q.options[2].text,'WHERE x <= 10 AND y <> 2');assert.equal(q.options[3].text,'name_sp <parameter=');
});
test('reads the leading answer separately from translated question and explanation',()=>{
 const note='A\n\nTùy chọn ON UPDATE CASCADE có tác dụng gì?\nA. Tự động cập nhật giá trị khóa ngoại.\nON UPDATE CASCADE giúp duy trì tính toàn vẹn tham chiếu.';
 const slide={pageElements:[shape('q','What does ON UPDATE CASCADE do?\nA. Updates the foreign key\nB. Deletes the row')],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'n'},pageElements:[shape('n',note)]}}};
 const q=parsePresentation({slides:[slide]}).questions[0];assert.equal(q.answer,'A');assert.equal(q.verified,true);assert.ok(q.explanation.startsWith('Tùy chọn'));assert.ok(!q.stem.includes('Tùy chọn'));
 slide.slideProperties.notesPage.pageElements=[shape('n','A\nB')];assert.equal(parsePresentation({slides:[slide]}).questions[0].answer,'');
});
test('single uppercase note survives split runs and invisible direction marks',()=>{
 const p={slides:[{pageElements:[shape('q','Question\nA. One\nB. Two')],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'n'},pageElements:[{objectId:'n',shape:{text:{textElements:[{textRun:{content:'\u200e'}},{textRun:{content:'B'}},{textRun:{content:'\n'}}]}}}]}}}]};
 const q=parsePresentation(p).questions[0];assert.equal(q.answer,'B');assert.equal(q.verified,true);
});
test('notes fallback uses the unique BODY placeholder, never the page number',()=>{
 const slide={pageElements:[shape('q','Question\nA. One\nB. Two')],slideProperties:{notesPage:{pageElements:[shape('page','A'),{...shape('body','B'),shape:{...shape('body','B').shape,placeholder:{type:'BODY'}}}]}}};
 assert.equal(parsePresentation({slides:[slide]}).questions[0].answer,'B');
 delete slide.slideProperties.notesPage.pageElements[1].shape.placeholder;
 assert.equal(parsePresentation({slides:[slide]}).questions[0].answer,'');
});
test('reads grouped questions and speaker notes, automatically accepts explicit speaker-note answer',()=>{const p={presentationId:'abc',slides:[{objectId:'s1',pageElements:[{elementGroup:{children:[shape('q','What is an index?\nA. Fast lookup\nB. Alias')]}}],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'note'},pageElements:[shape('number','1'),shape('note','Answer: A\n')]}}},{objectId:'s2',pageElements:[{image:{}}]}]};const r=parsePresentation(p);assert.equal(r.questions.length,1);assert.equal(r.questions[0].answer,'A');assert.equal(r.questions[0].verified,true);assert.equal(r.questions[0].options[1].text,'Alias');assert.deepEqual(r.skipped,[2]);});
test('ambiguous notes never create a guessed answer',()=>{const r=parsePresentation({slides:[{pageElements:[shape('q','Question\nA. One\nB. Two')],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'n'},pageElements:[shape('n','A or B')]}}}]});assert.equal(r.questions[0].answer,'')});
test('accepts explicit note formats but leaves missing, conflicting and multiple answers for review',()=>{
 for(const note of ['B','(B)','Answer: B','Correct answer: b','Đáp án: B','Đáp án đúng: B']){
  const q=parsePresentation({slides:[{pageElements:[shape('q','Question\nA. One\nB. Two')],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'n'},pageElements:[shape('n',note)]}}}]}).questions[0];
  assert.equal(q.answer,'B',note);assert.equal(q.verified,true);assert.equal(q.answerSource,'speaker-notes');
 }
 for(const note of ['','A or B','Answer: H','A\nB','Maybe B']){
  const q=parsePresentation({slides:[{pageElements:[shape('q','Question\nA. One\nB. Two')],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'n'},pageElements:[shape('n',note)]}}}]}).questions[0];
  assert.equal(q.answer,'',note);assert.equal(q.verified,false);
 }
});
test('splits AD, ACE and ABC notes into valid ordered sets, including explanation tails',()=>{
 for(const [note,expected] of [['AD','AD'],['ACE','ACE'],['ABC','ABC'],['ECA','ACE'],['A, D','AD'],['Đáp án: ACE\nGiải thích bằng tiếng Việt.','ACE']]){
  const q=parsePresentation({slides:[{pageElements:[shape('q','Choose correct answers\nA. First\nB. Second\nC. Third\nD. Fourth\nE. Fifth')],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'n'},pageElements:[shape('n',note)]}}}]}).questions[0];
  assert.equal(q.answer,expected,note);assert.equal(q.verified,true);assert.equal(q.explanation,note.includes('Giải thích')?'Giải thích bằng tiếng Việt.':'');
 }
 assert.equal(normalizeAnswer('AZ',[{id:'A'}]),'');
});
const multi=mode=>({mode,questions:[{id:'m',answer:'ACE',options:'ABCDE'.split('').map(id=>({id}))}],answers:{},deadline:2000,done:false});
test('multi-answer study stores drafts, confirms explicitly and locks only after confirmation',()=>{
 const s=multi('study'),q=s.questions[0];answerQuestion(s,'m','C');answerQuestion(s,'m','A');assert.equal(s.answers.m,undefined);assert.equal(optionState(s,q,'A'),'selected');assert.equal(grade(s.questions,s.answers),0);
 const restored=JSON.parse(JSON.stringify(s));answerQuestion(restored,'m','E');assert.equal(confirmQuestion(restored,'m'),true);assert.equal(restored.answers.m,'ACE');assert.equal(grade(restored.questions,restored.answers),1);assert.equal(optionState(restored,q,'C'),'correct');assert.equal(answerQuestion(restored,'m','B'),false);assert.equal(confirmQuestion(restored,'m'),false);
});
test('multi-answer exams permit toggling and require exactly the full answer set',()=>{
 const s=multi('exam'),q=s.questions[0];for(const id of 'ECA')answerQuestion(s,'m',id,1000);assert.equal(s.answers.m,'ACE');assert.equal(grade(s.questions,s.answers),1);assert.equal(optionState(s,q,'A'),'selected');
 answerQuestion(s,'m','B',1000);assert.equal(grade(s.questions,s.answers),0);answerQuestion(s,'m','B',1000);answerQuestion(s,'m','E',1000);assert.equal(grade(s.questions,s.answers),0);assert.equal(answerQuestion(s,'m','E',2000),false);
 assert.equal(grade(s.questions,{m:'EAC'}),1);assert.equal(grade(s.questions,{m:'AC'}),0);assert.equal(grade(s.questions,{m:'ABCE'}),0);
 for(const id of 'AC')answerQuestion(s,'m',id,1000);assert.equal(s.answers.m,undefined);
});
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
test('removes the source watermark and its icon from an option without altering the answer text',()=>{
 for(const footer of ['© Hoàng Hoàng Buôn Source','@ Hoang Hoang Buon Source','Hoàng Hoàng Buén Source','📍 Hoàng Hoàng Buôn Source','© Hoàng Hoàng Buén Sourge','© H0ang Hoang Buon S0urce','Hoang Hoang Buon Sourcc','Hoàng\nHoàng Buôn Source']){
  const r=parsePresentation({slides:[{pageElements:[shape('q',`Question?\nA. First\nB. Second\nC. Third\nD. Enhanced data security\n${footer}`)]}]});
  assert.equal(r.questions[0].options[3].text,'Enhanced data security',footer);assert.equal(r.questions[0].options.length,4);
 }
});
test('removes standalone logo OCR without touching SQL or English question content',()=>{
 const text='Which SQL statement returns matching records?\nFORU\nA. SELECT * FROM source_table INNER JOIN sales ON id = custID;\nLEARN TO KNOW\nB. SELECT * FROM source_table;\n© Hoàng Hoàng Buén Sourge';
 const q=parsePresentation({slides:[{pageElements:[shape('q',text)]}]}).questions[0];
 assert.equal(q.stem,'Which SQL statement returns matching records?');assert.equal(q.options[0].text,'SELECT * FROM source_table INNER JOIN sales ON id = custID;');assert.equal(q.options[1].text,'SELECT * FROM source_table;');
 const old=cleanQuestion({...q,answerSource:'speaker-notes',explanation:'Tùy chọn này có nghĩa là…'});assert.equal(old.explanation,'Tùy chọn này có nghĩa là...');assert.equal(old.options[1].text,q.options[1].text);
 assert.equal(cleanSlideContent("SELECT * FROM source WHERE name = 'Việt Nam';"),"SELECT * FROM source WHERE name = 'Việt Nam';");
});
test('keeps meaningful source terminology and content following a watermark',()=>{
 assert.equal(cleanSlideContent('What is an open source database?'),'What is an open source database?');
 assert.equal(cleanSlideContent('Hoàng Hoàng Buôn Source\nWhich clause filters groups?'),'Which clause filters groups?');
 assert.equal(cleanSlideContent('A source table has rows.'),'A source table has rows.');
});
test('existing shuffled questions return to source choice order without changing grading or source references',()=>{
 const old={id:'q',stem:'Question?',answer:'B',verified:true,slide:320,url:'original',options:[{id:'D',text:'Fourth\n© Hoàng Hoàng Buôn Source'},{id:'B',text:'Second'},{id:'A',text:'First'},{id:'C',text:'Third'}]};
 const q=cleanQuestion(old);assert.deepEqual(q.options.map(o=>o.id),['A','B','C','D']);assert.equal(q.options[3].text,'Fourth');assert.equal(q.answer,'B');assert.equal(q.verified,true);assert.equal(q.slide,320);assert.equal(q.url,'original');assert.equal(grade([q],{q:'B'}),1);assert.equal(old.options[0].id,'D');
});
