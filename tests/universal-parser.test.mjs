import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTextExam,parseExamFile} from '../dist/universal-parser.mjs';
test('keeps full multi-answer sets and separates inline choices from metadata',async()=>{
 const [q]=await parseTextExam('Question 1: Choose SQL clauses.\nA. WHERE B. HAVING C. SELECT D. ORDER BY\nAnswer: ACE\nExplanation: Full reason.','exam.txt');
 assert.equal(q.answer,'','unknown label must not become a partial answer');
 const [valid]=await parseTextExam('Câu 1: Chọn đáp án.\nA. は B. の C. です D. だいがく\nĐáp án: A, C\nGiải thích: Dòng một.\nDòng hai.','exam.txt');
 assert.equal(valid.answer,'AC');assert.deepEqual(valid.options.map(o=>o.text),['は','の','です','だいがく']);assert.equal(valid.explanation,'Dòng một.\nDòng hai.');
});
test('splits numeric questions and retains multiline choices',async()=>{
 const qs=await parseTextExam('1. First?\nA. SELECT *\nFROM users\nB. SELECT id\nAnswer: AB\n2. Second?\nA. Yes\nB. No\nAnswer: B','exam.txt');
 assert.equal(qs.length,2);assert.equal(qs[0].answer,'AB');assert.equal(qs[0].options[0].text,'SELECT *\nFROM users');assert.equal(qs[1].stem,'Second?');
});
test('PDF extraction handles flattened inline choices',async()=>{
 const previous=globalThis.window;
 globalThis.window={pdfjsLib:{getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'Question 1: Pick?',hasEOL:true},{str:'A. One B. Two C. Three D. Four Answer: BD',hasEOL:true}]})})})})}};
 try{const [q]=await parseExamFile({name:'test.pdf',arrayBuffer:async()=>new ArrayBuffer(0)});assert.equal(q.answer,'BD');assert.deepEqual(q.options.map(o=>o.text),['One','Two','Three','Four'])}finally{globalThis.window=previous}
});
test('image proposals remain unverified with AI provenance',async()=>{
 const previousFetch=globalThis.fetch,previousReader=globalThis.FileReader;
 globalThis.FileReader=class{readAsDataURL(){this.result='data:image/png;base64,aGVsbG8=';this.onload()}};
 globalThis.fetch=async(_url,init)=>{assert.equal(JSON.parse(init.body).purpose,'explanation');return Response.json({answers:[{status:'answered',kind:'question',answer:'AB',explanation:'Reason',optionReasons:[{id:'A',text:'One'},{id:'B',text:'Two'}]}]})};
 try{const [q]=await parseExamFile({name:'test.png',type:'image/png'},{aiBase:'https://ai.example'});assert.equal(q.answer,'AB');assert.equal(q.verified,false);assert.equal(q.answerSource,'gemini');assert.equal(q.explanationSource,'gemini')}finally{globalThis.fetch=previousFetch;globalThis.FileReader=previousReader}
});
