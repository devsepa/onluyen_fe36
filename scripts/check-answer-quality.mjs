// Small synthetic regression sample, not a claim of general accuracy.
import assert from 'node:assert/strict';
import {AI_API_BASE} from '../dist/site-config.mjs';
import {readFile} from 'node:fs/promises';
const cases=[
 {id:'quality-negation',stem:'Which of the following is NOT an SQL aggregate function?',choices:['COUNT','MAX','SUM','WHERE'],expected:'D'},
 {id:'quality-rows',stem:'In standard SQL, which clause filters individual rows before GROUP BY?',choices:['WHERE','HAVING','ORDER BY','GROUP BY'],expected:'A'},
 {id:'quality-multiple',stem:'Select ALL prime numbers among the following choices.',choices:['2','4','3','9'],expected:'AC'},
 {id:'quality-japanese',stem:'正しい助詞を選んでください。私は毎日パン（　）食べます。',choices:['に','を','で','へ'],expected:'B'},
 {id:'quality-missing',stem:'According to the missing table, which employee has the highest salary?',choices:['An','Binh','Chi','Dung'],expected:''},
];
let passed=0;
for(const sample of cases){
 const questions=[{id:sample.id,stem:sample.stem,options:sample.choices.map((text,i)=>({id:String.fromCharCode(65+i),text}))}];
 const response=await fetch(new URL('/v1/answers',process.env.AI_API_BASE||AI_API_BASE),{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://devsepa.github.io'},body:JSON.stringify({purpose:'explanation',questions}),signal:AbortSignal.timeout(95000)});
 const body=await response.json();assert.ok(response.ok,JSON.stringify({id:sample.id,status:response.status,error:body.error}));const answer=body.answers?.[0];
 assert.equal(answer?.answer,sample.expected,sample.id);assert.equal(answer.status,sample.expected?'answered':'uncertain');
 if(sample.expected){assert.equal(answer.optionReasons?.length,sample.choices.length);assert.ok(typeof answer.tip==='string'&&answer.tip.trim().length>10,'Missing useful memory aid: '+sample.id)}
 console.log(sample.id+': passed ('+answer.status+')');passed++;
}
for(const [file,expected,kind]of [['vision-smoke.png','A','question'],['non-question-smoke.png','','other']]){
 const bytes=await readFile(new URL('../tests/fixtures/'+file,import.meta.url)),questions=[{id:'quality-'+kind,stem:'Read the original slide image.',options:[{id:'A',text:''},{id:'B',text:''}],image:{mimeType:'image/png',data:bytes.toString('base64')}}];
 const response=await fetch(new URL('/v1/answers',process.env.AI_API_BASE||AI_API_BASE),{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://devsepa.github.io'},body:JSON.stringify({purpose:'explanation',questions}),signal:AbortSignal.timeout(95000)});
 const body=await response.json();assert.ok(response.ok,JSON.stringify({file,status:response.status,error:body.error}));const answer=body.answers?.[0];assert.equal(answer?.answer,expected,file);assert.equal(answer.kind,kind);if(expected)assert.ok(answer.tip?.trim().length>10);
 console.log(file+': passed ('+kind+')');passed++;
}
console.log(passed+'/'+(cases.length+2)+' synthetic checks passed; evaluate real subject questions separately.');
