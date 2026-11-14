import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyGemini400,generateAnswers,generateWithFallback,validateQuestions} from '../backend/worker.mjs';
import {solveBatch} from '../dist/ai.mjs';
const png=readFileSync(new URL('./fixtures/vision-smoke.png',import.meta.url)).toString('base64'),q={id:'q',stem:'Slide',options:[{id:'A',text:''},{id:'B',text:''}],image:{mimeType:'image/png',data:png}},answer={kind:'question',labels:['A','B'],id:'q',status:'answered',answer:'A',explanation:'Explanation'};
test('400 diagnostics distinguish image, config, key and project restrictions without returning raw input',()=>{
 for(const [detail,code]of [['Provided image is not valid.','AI_IMAGE_INVALID'],['Unable to process input image','AI_IMAGE_INVALID'],['Invalid response_schema','AI_CONFIG_UNSUPPORTED'],['Thinking level unsupported','AI_CONFIG_UNSUPPORTED'],['temperature is not supported by this model','AI_CONFIG_UNSUPPORTED'],['API key not valid. AIza-secret','AI_KEY_INVALID'],['Please setup a paid plan','AI_PROJECT_RESTRICTED'],['Unsupported user location','AI_REGION_UNSUPPORTED'],['User location is not supported for the API use.','AI_REGION_UNSUPPORTED'],['Private unknown payload','AI_REQUEST_INVALID']]){
  const result=classifyGemini400(detail);assert.equal(result.code,code,detail);assert.ok(!result.message.includes('AIza-secret'));assert.ok(!result.message.includes('Private unknown payload'));
 }
});
test('Gemini 3 requests omit sampling/thinking parameters that vary by model',async()=>{
 await generateAnswers([q],{GEMINI_MODEL:'gemini-3.5-flash-lite',GEMINI_API_KEY:'secret'},async(url,init)=>{const config=JSON.parse(init.body).generationConfig;assert.equal(config.temperature,undefined);assert.equal(config.topP,undefined);assert.equal(config.thinkingConfig,undefined);assert.ok(config.responseSchema);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({answers:[answer]})}]}}]})});
});
test('image bytes are checked before Gemini and MIME is derived from content',()=>{
 assert.throws(()=>validateQuestions({questions:[{...q,image:{mimeType:'image/png',data:'aGVsbG8='}}]}),error=>error.code==='AI_IMAGE_INVALID');
 const normalized=validateQuestions({questions:[{...q,image:{mimeType:'image/jpeg',data:png}}]});assert.equal(normalized[0].image.mimeType,'image/png');
});
test('fallback is bounded for incompatible model config and never retries bad images or invalid keys',async()=>{
 const env={GEMINI_MODEL:'primary',GEMINI_FALLBACK_MODEL:'secondary',GEMINI_API_KEY:'secret'};let calls=0;
 const result=await generateWithFallback([q],env,async()=>++calls===1?Response.json({error:{message:'Unknown name thinkingConfig'}},{status:400}):Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({answers:[answer]})}]}}]}));assert.equal(result.model,'secondary');assert.equal(calls,2);
 for(const detail of ['Provided image is not valid','API key not valid']){let attempts=0;await assert.rejects(()=>generateWithFallback([q],env,async()=>{attempts++;return Response.json({error:{message:detail}},{status:400})}));assert.equal(attempts,1)}
});
test('client preserves safe image error codes so one bad slide can be skipped',async()=>{
 await assert.rejects(()=>solveBatch('https://worker.example',[q],'google-token',{fetcher:async()=>Response.json({error:'Image unreadable',code:'AI_IMAGE_INVALID'},{status:400})}),error=>error.code==='AI_IMAGE_INVALID'&&error.status===400);
});
