import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAnswersWithGroq,validateResults} from '../backend/worker.mjs';
import {normalizeExplanation,explanationKey} from '../dist/explanation-data.mjs';
import {explanationCacheKey} from '../backend/explanation-cache.mjs';
const question={id:'exact-id',stem:'Which clause filters rows before aggregation?',options:[{id:'A',text:'WHERE'},{id:'B',text:'HAVING'}],explain:true};
const result={id:question.id,status:'answered',answer:'A',explanation:'WHERE lọc từng dòng trước khi GROUP BY.',tip:'WHERE lọc dòng trước nhóm; HAVING lọc nhóm sau GROUP BY.',optionReasons:[{id:'A',text:'WHERE',reason:'Lọc từng dòng trước khi nhóm.'},{id:'B',text:'HAVING',reason:'Lọc nhóm sau khi tổng hợp, không phải từng dòng.'}]};
const fetcher=value=>async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answers:[value]})}}]});
test('Groq uncertainty remains uncertain; no fallback first option or fabricated rationale',async()=>{
 const uncertain={id:question.id,status:'uncertain',answer:'',explanation:'Thiếu bảng dữ liệu để tính kết quả.',optionReasons:[],tip:''};
 assert.deepEqual(await generateAnswersWithGroq([question],{GROQ_API_KEY:'synthetic'},fetcher(uncertain)),[uncertain]);
});
test('Groq rejects missing/invalid answers, missing reasons and foreign ids instead of guessing or reassigning',async()=>{
 for(const invalid of [{...result,answer:''},{...result,answer:'Answer A'},{...result,answer:'Z'},{...result,id:'1'},{...result,optionReasons:[]},{...result,optionReasons:undefined}])await assert.rejects(generateAnswersWithGroq([question],{GROQ_API_KEY:'synthetic'},fetcher(invalid)));
});
test('both provider prompt requests exact task, uncertainty, original choices and a conditional rule-based memory aid',async()=>{
 let prompt;const response=await generateAnswersWithGroq([question],{GROQ_API_KEY:'synthetic'},async(_url,init)=>{const body=JSON.parse(init.body);prompt=body.messages[0].content;assert.equal(body.temperature,0.1);return fetcher(result)()});
 for(const term of ['NOT/EXCEPT','EVERY original option','uncertain','Never force a guess','tip','not a trick based on answer-letter'])assert.ok(prompt.includes(term),term);
 assert.equal(response[0].tip,result.tip);assert.equal(normalizeExplanation({...question,answer:'A'},response[0]).tip,result.tip);
});
test('truncated responses and unclassified images never become valid answers',async()=>{
 await assert.rejects(generateAnswersWithGroq([question],{GROQ_API_KEY:'synthetic'},async()=>Response.json({choices:[{finish_reason:'length',message:{content:JSON.stringify({answers:[result]})}}]})));
 assert.throws(()=>validateResults({answers:[result]},[{...question,image:{}}]));
});
test('new cache revision and provider identity do not reuse previous generated explanations',async()=>{
 const q={...question,sourceId:'s',url:'',answer:'A'};assert.equal(JSON.parse(explanationKey(q))[0],3);
 assert.notEqual(await explanationCacheKey(q,{GROQ_API_KEY:'synthetic'}),await explanationCacheKey(q,{}));
});
test('a conflicting independently solved answer cannot overwrite the original answer or be shown as its explanation',()=>{
 assert.throws(()=>normalizeExplanation({...question,answer:'B'},result),/khác đáp án gốc/);
});
