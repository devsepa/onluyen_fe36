// CI smoke test: one tiny synthetic question; never log the key or upstream body.
import {generateWithFallback} from '../backend/worker.mjs';
import {normalizeExplanation} from '../dist/explanation-data.mjs';
import {readFile} from 'node:fs/promises';
import {parseConfig} from './read-config.mjs';
const config=parseConfig(await readFile(new URL('../backend/wrangler.jsonc',import.meta.url),'utf8'));
const image=await readFile(new URL('../tests/fixtures/vision-smoke.png',import.meta.url));
const questions=[{id:'smoke',stem:'Read the question and choices from the slide image.',options:[{id:'A',text:''},{id:'B',text:''}],image:{mimeType:'image/png',data:image.toString('base64')}}];
questions[0].explain=true;
const other=await readFile(new URL('../tests/fixtures/non-question-smoke.png',import.meta.url));
questions.push({id:'resource-page',stem:'Slide 2',options:[{id:'A',text:''},{id:'B',text:''}],image:{mimeType:'image/png',data:other.toString('base64')}});
try{
 const fetcher=async(url,init)=>{
  const response=await fetch(url,init);
  if(!response.ok){try{const body=await response.clone().json();const key=process.env.GEMINI_API_KEY||'__NO_KEY__';const message=String(body.error?.message||'').replaceAll(key,'[redacted]').replace(/AIza[\w-]+/g,'[redacted]').slice(0,700);console.error(`Gemini setup detail: ${message}`)}catch{}}
  if(!response.ok){let status='UNKNOWN',reason='';try{const body=await response.clone().json();if(/^[A-Z_]+$/.test(body.error?.status))status=body.error.status;reason=(body.error?.details||[]).map(d=>d.reason).filter(r=>typeof r==='string'&&/^[A-Z_]+$/.test(r)).join(', ');if(/API key not valid/i.test(body.error?.message||''))reason='API_KEY_INVALID';if(/response.?schema/i.test(body.error?.message||''))reason='RESPONSE_SCHEMA_INVALID'}catch{}console.error(`Gemini HTTP ${response.status} (${status}); reason=${reason||'not specified'}. Check model availability, key and project quota.`)}
  if(response.ok){try{const data=await response.clone().json(),text=(data.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('');const parsed=JSON.parse(text);console.log('Synthetic slide classification:',JSON.stringify(parsed.answers?.map(a=>({id:a.id,kind:a.kind,status:a.status,answer:a.answer,labels:a.labels}))))}catch{}}
  return response;
 };
 // Production accepts only one image per request. Check the same path here.
 const answers=[],models=[];
 for(const question of questions){const result=await generateWithFallback([question],{GEMINI_API_KEY:process.env.GEMINI_API_KEY,GEMINI_MODEL:config.vars.GEMINI_MODEL,GEMINI_FALLBACK_MODEL:config.vars.GEMINI_FALLBACK_MODEL},fetcher);answers.push(...result.answers);models.push(result.model)}
 const model=[...new Set(models)].join(', ');
 if(answers[0]?.answer!=='A'||answers[0]?.kind!=='question'||answers[1]?.kind!=='other'||answers[1]?.answer!=='')throw Error('Synthetic question/non-question image check did not pass.');
 normalizeExplanation({...questions[0],answer:'A'},answers[0]);
 console.log(`Gemini live image-answer and structured explanation smoke test passed with ${model}.`);
}catch(error){console.error(error.message);process.exitCode=1}
