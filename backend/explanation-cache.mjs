// Stored server-generated explanations only; clients cannot publish cache entries.
export const EXPLANATION_REVISION='study-explanation-2';
export async function explanationCacheKey(question,env={}){
 const content=question.image?['image',question.image.mimeType,question.image.data]:['text',question.stem,question.options.map(o=>[o.id,o.text])];
 const bytes=new TextEncoder().encode(JSON.stringify([EXPLANATION_REVISION,env.GEMINI_MODEL||'gemini-3.8-flash',content]));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export class StoredExplanationCache{
 constructor(state,env,generate,validate){this.storage=state.storage;this.env=env;this.generate=generate;this.validate=validate;this.pending=null}
 async fetch(request){
  try{
   const question=await request.json();
   if(!question.explain)return Response.json({error:'Unsupported cache request'},{status:400});
   const input={...question,id:'explanation'};
   const stored=await this.storage.get('result');
   if(stored?.revision===EXPLANATION_REVISION){try{this.validate(stored.result,[input]);return Response.json({...stored.result,reused:true})}catch{/* Discard entries that no longer satisfy the response contract. */}}
   if(!this.pending)this.pending=(async()=>{
    const result=await this.generate([input],this.env);
    const answer=result.answers[0];
    if(answer.status==='answered'&&answer.explanation.trim()&&answer.optionReasons?.length>=2){
     await this.storage.put('result',{revision:EXPLANATION_REVISION,createdAt:Date.now(),result});
    }
    return result;
   })().finally(()=>{this.pending=null});
   return Response.json({...await this.pending,reused:false});
  }catch(error){return Response.json({error:error.status?error.message:'Chưa tải được giải thích. Hãy thử lại.',...(error.code?{code:error.code}:{})},{status:error.status||503})}
 }
}
export async function explainWithSharedCache(questions,env,generate){
 if(!env.EXPLANATION_CACHE)return generate(questions,env);
 const responses=await Promise.all(questions.map(async question=>{
  const key=await explanationCacheKey(question,env),object=env.EXPLANATION_CACHE.get(env.EXPLANATION_CACHE.idFromName(key));
  const response=await object.fetch(new Request('https://explanation-cache/',{method:'POST',body:JSON.stringify(question)}));
  const data=await response.json();if(!response.ok){const error=Error(data.error||'Chưa tải được giải thích.');error.status=response.status;error.code=data.code;throw error}
  return {answer:{...data.answers[0],id:question.id,reused:!!data.reused},model:data.model};
 }));
 return {answers:responses.map(r=>r.answer),model:[...new Set(responses.map(r=>r.model))].join(', ')};
}
