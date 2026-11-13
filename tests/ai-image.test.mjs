import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateQuestions,validateResults,generateAnswers} from '../backend/worker.mjs';
import {solveBatch,applyAiResults} from '../dist/ai.mjs';
const png=readFileSync(new URL('./fixtures/vision-smoke.png',import.meta.url)).toString('base64');
const question=()=>({id:'image-1',stem:'Slide 10',url:'https://docs.google.com/presentation/d/private/edit#slide=id.s10',options:'ABCD'.split('').map(id=>({id,text:''})),answer:'',image:{mimeType:'image/png',data:png}});
test('vision input accepts blank choice text, strips source links, and limits uploads',()=>{
 const q=question(),valid=validateQuestions({questions:[q]});assert.equal(valid[0].url,undefined);assert.deepEqual(valid[0].image,q.image);
 for(const image of [{mimeType:'image/svg+xml',data:'aGVsbG8='},{mimeType:'image/png',data:'https://private'},{mimeType:'image/png',data:'a'.repeat(2800004)}])assert.throws(()=>validateQuestions({questions:[{...q,image}]}));
 assert.throws(()=>validateQuestions({questions:[q,{...q,id:'other'}]}));
});
test('Gemini receives inline image separately from text, returns multiple labels, without forwarding identity',async()=>{
 const q=validateQuestions({questions:[question()]})[0];let payload;
 const answers=await generateAnswers([q],{GEMINI_API_KEY:'server-secret',GEMINI_MODEL:'test-model'},async(url,init)=>{
  payload=JSON.parse(init.body);assert.equal(init.headers['x-goog-api-key'],'server-secret');
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({answers:[{id:q.id,status:'answered',answer:'ACE',explanation:'Explanation'}]})}]}}]});
 });
 assert.deepEqual(payload.contents[0].parts[1],{inlineData:q.image});assert.ok(!payload.contents[0].parts[0].text.includes('data'));assert.equal(answers[0].answer,'ACE');
 assert.throws(()=>validateResults({answers:[{...answers[0],answer:'AA'}]},[q]));assert.throws(()=>validateResults({answers:[{...answers[0],answer:'AZ'}]},[q]));
});
test('client sends images to Worker only and persists proposals without storing image bytes or replacing notes',async()=>{
 const q=question();const result=await solveBatch('https://worker.example',[q],'google-token',{fetcher:async(url,init)=>{
  assert.equal(url.hostname,'worker.example');const body=JSON.parse(init.body);assert.equal(body.questions[0].url,undefined);assert.deepEqual(body.questions[0].image,q.image);
  return Response.json({model:'vision',answers:[{id:q.id,status:'answered',answer:'ACE',explanation:'Explanation'}]});
 }});
 const {image,...stored}=q,bank=[stored];assert.equal(applyAiResults(bank,[q],result.answers,result.model).applied,1);assert.equal(bank[0].answer,'ACE');assert.equal(bank[0].image,undefined);assert.equal(bank[0].options.at(-1).id,'E');assert.equal(bank[0].verified,false);
 bank[0].answer='B';bank[0].answerSource='speaker-notes';assert.equal(applyAiResults(bank,[q],result.answers,result.model).applied,0);assert.equal(bank[0].answer,'B');
});
