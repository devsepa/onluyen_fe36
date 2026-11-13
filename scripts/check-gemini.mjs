// CI smoke test: one tiny synthetic question; never log the key or upstream body.
import {generateAnswers} from '../backend/worker.mjs';
import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile(new URL('../backend/wrangler.jsonc',import.meta.url),'utf8'));
const questions=[{id:'smoke',stem:'What is 1 + 1?',options:[{id:'A',text:'2'},{id:'B',text:'3'}]}];
try{
 const answers=await generateAnswers(questions,{GEMINI_API_KEY:process.env.GEMINI_API_KEY,GEMINI_MODEL:config.vars.GEMINI_MODEL},async(url,init)=>{
  const response=await fetch(url,init);
  if(!response.ok){let status='UNKNOWN',reason='';try{const body=await response.clone().json();if(/^[A-Z_]+$/.test(body.error?.status))status=body.error.status;reason=(body.error?.details||[]).map(d=>d.reason).filter(r=>typeof r==='string'&&/^[A-Z_]+$/.test(r)).join(', ');if(/API key not valid/i.test(body.error?.message||''))reason='API_KEY_INVALID';if(/response.?schema/i.test(body.error?.message||''))reason='RESPONSE_SCHEMA_INVALID'}catch{}console.error(`Gemini HTTP ${response.status} (${status}); reason=${reason||'not specified'}. Check model availability, key and project quota.`)}
  return response;
 });
 if(answers[0]?.answer!=='A')throw Error('Synthetic answer check did not pass.');
 console.log('Gemini live structured-answer smoke test passed.');
}catch(error){console.error(error.message);process.exitCode=1}
