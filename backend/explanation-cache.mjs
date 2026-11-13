// Stored server-generated explanations only; clients cannot publish cache entries.
export const EXPLANATION_REVISION='study-explanation-2';
export class ExplanationCacheError extends Error{constructor(status,message,code){super(message);this.status=status;this.code=code}}
export async function explanationCacheKey(question,env={}){
 const content=question.image?['image',question.image.mimeType,question.image.data]:['text',question.stem,question.options.map(o=>[o.id,o.text])];
 const bytes=new TextEncoder().encode(JSON.stringify([EXPLANATION_REVISION,env.GEMINI_MODEL||'gemini-3.8-flash',content]));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export class StoredExplanationCache{
 constructor(state,env,generate,validate){this.storage=state.storage;this.env=env;this.generate=generate;this.validate=validate;this.pending=null;this.epoch=0}
 async fetch(request){
  try{
   const path=new URL(request.url).pathname,record=await this.storage.get('result');
   const etag=record?.etag||(record?'legacy:'+record.createdAt:'missing');
   if(path==='/status'&&request.method==='GET')return Response.json({etag,available:!!record&&!record.invalidated});
   if(path==='/moderate'&&request.method==='GET')return record?Response.json({etag,result:record.result,invalidated:!!record.invalidated,reviewed:!!record.reviewed}):Response.json({error:'Chưa có giải thích lưu chung cho câu này.'},{status:404});
   if(path==='/moderate'&&request.method==='PUT'){
    const input=await request.json();if(!record)return Response.json({error:'Chưa có giải thích để sửa.'},{status:404});
    if(input.etag!==etag)return Response.json({error:'Giải thích đã thay đổi. Hãy tải lại trước khi lưu.'},{status:409});
    if(!['invalidate','replace'].includes(input.action))return Response.json({error:'Thao tác không hợp lệ.'},{status:400});
    let result=record.result;
    if(input.action==='replace'){
     const current=result.answers[0],labels=current.optionReasons.map(o=>o.id),original=current.optionReasons;
     if(!Array.isArray(input.optionReasons)||input.optionReasons.length!==labels.length||input.optionReasons.some(o=>original.find(p=>p.id===o.id)?.text!==o.text))return Response.json({error:'Giữ nguyên nhãn và nội dung lựa chọn gốc.'},{status:400});
     result={model:'reviewed',answers:[{...current,answer:input.answer,explanation:input.explanation,optionReasons:input.optionReasons}]};
     try{this.validate(result,[{id:current.id,explain:true,stem:'Reviewed explanation',options:original.map(o=>({id:o.id,text:o.text})),...(current.kind?{image:{}}:{})}])}catch{return Response.json({error:'Đáp án hoặc giải thích chưa đầy đủ.'},{status:400})}
    }
    return this.storage.transaction(async tx=>{const latest=await tx.get('result');if((latest?.etag||'legacy:'+latest?.createdAt)!==input.etag)return Response.json({error:'Giải thích đã thay đổi. Hãy tải lại.'},{status:409});this.epoch++;const next={...record,result,etag:crypto.randomUUID(),reviewed:input.action==='replace',invalidated:input.action==='invalidate',updatedAt:Date.now()};await tx.put('result',next);return Response.json({ok:true,etag:next.etag})});
   }
   const question=await request.json();
   if(!question.explain)return Response.json({error:'Unsupported cache request'},{status:400});
   const input={...question,id:'explanation'};
   const stored=await this.storage.get('result');
   if(stored?.revision===EXPLANATION_REVISION&&!stored.invalidated){try{this.validate(stored.result,[input]);return Response.json({...stored.result,reused:true,cacheEtag:stored.etag||'legacy:'+stored.createdAt,reviewed:!!stored.reviewed})}catch{/* Discard entries that no longer satisfy the response contract. */}}
   if(!this.pending)this.pending=(async()=>{
    const epoch=this.epoch;
    const result=await this.generate([input],this.env);
    this.validate(result,[input]);
    if(epoch!==this.epoch){const latest=await this.storage.get('result');if(latest&&!latest.invalidated)return {...latest.result,cacheEtag:latest.etag,reviewed:!!latest.reviewed};throw new ExplanationCacheError(409,'Giải thích vừa được gỡ để kiểm tra. Hãy thử lại.')}
    const answer=result.answers[0];
    if(answer.status==='answered'&&answer.explanation.trim()&&answer.optionReasons?.length>=2){
     const cacheEtag=crypto.randomUUID();if(epoch===this.epoch){await this.storage.put('result',{revision:EXPLANATION_REVISION,createdAt:Date.now(),etag:cacheEtag,result});return {...result,cacheEtag}}
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
  const data=await response.json();if(!response.ok)throw new ExplanationCacheError(response.status,data.error||'Chưa tải được giải thích.',data.code);
  return {answer:{...data.answers[0],id:question.id,reused:!!data.reused,cacheKey:key,cacheEtag:data.cacheEtag,reviewed:!!data.reviewed},model:data.model};
 }));
 return {answers:responses.map(r=>r.answer),model:[...new Set(responses.map(r=>r.model))].join(', ')};
}
