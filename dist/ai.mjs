import {validateOptionReasons} from './explanation-data.mjs?v=2026.11.14.32';
import {aiRateLimitError} from './ai-rate-limit.mjs?v=2026.11.14.32';
const validSet=(answer,q)=>typeof answer==='string'&&/^[A-H]{1,8}$/.test(answer)&&new Set(answer).size===answer.length&&[...answer].every(label=>q.image||q.options.some(o=>o.id===label));
export function questionFingerprint(q){return JSON.stringify([q.sourceId,q.url,q.stem,q.options.map(o=>[o.id,o.text])])}
export function readyForPractice(q){return !!q.answer&&(q.verified===true||q.answerSource==='gemini')}
export function applyAiResults(bank,submitted,results,model){
 const sent=new Map(submitted.map(q=>[q.id,q]));let applied=0,uncertain=0;
 const seen=new Set();
 for(const result of results){
  const original=sent.get(result.id),q=bank.find(q=>q.id===result.id);
  if(!original||!q||q.answer||seen.has(q.id)||questionFingerprint(q)!==questionFingerprint(original))continue;
  seen.add(q.id);
  if(original.image&&result.kind==='other'){bank.splice(bank.indexOf(q),1);continue}
  if(original.image&&result.kind==='question'){
   q.slideKind='question';
   if(Array.isArray(result.labels)&&result.labels.length>=2)q.options=result.labels.map(id=>q.options.find(o=>o.id===id)||{id,text:''});
  }
  if(result.status==='answered'&&validSet(result.answer,original)&&typeof result.explanation==='string'){
   if(original.image&&[...result.answer].some(label=>!q.options.some(o=>o.id===label))){const last=Math.max(...[...result.answer].map(c=>c.charCodeAt(0)-65),q.options.length-1);q.options=Array.from({length:last+1},(_,i)=>q.options.find(o=>o.id===String.fromCharCode(65+i))||{id:String.fromCharCode(65+i),text:''})}
   if(typeof result.tip==='string'&&result.tip.trim())q.tip=result.tip.trim().slice(0,1200);q.answer=result.answer;q.explanation=result.explanation.slice(0,3000);q.verified=false;q.answerSource='gemini';q.aiModel=model;q.aiStatus='proposed';applied++;
  }else if(result.status==='uncertain'){q.aiStatus='uncertain';q.aiReason=String(result.explanation||'AI chưa xác định được đáp án.').slice(0,3000);uncertain++}
 }
 return {applied,uncertain};
}
export async function blobToBase64(blob){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result.split(',')[1]);
  reader.onerror=reject;
  reader.readAsDataURL(blob);
 });
}
export async function solveBatch(base,questions,token,{signal,fetcher=fetch,purpose}={}){
 const url=new URL(base);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('Dịch vụ AI chưa sẵn sàng.');
 const headers={'Content-Type':'application/json'};
 if(token)headers['Authorization']=`Bearer ${token}`;
 const response=await fetcher(new URL('/v1/answers',url),{method:'POST',headers,body:JSON.stringify({...(purpose?{purpose}:{}),questions:questions.map(q=>({id:q.id,stem:q.stem,options:q.options,...(q.image?{image:q.image}:{})}))}),signal});
 if(response.status===429)throw aiRateLimitError(response);
 let data;try{data=await response.json()}catch{throw Error('Không đọc được phản hồi AI. Kết quả trước đó vẫn được giữ.')}
 if(!response.ok){const error=Error(typeof data.error==='string'?data.error:'AI đang bận. Hãy tiếp tục sau.');error.status=response.status;if(['AI_IMAGE_INVALID','AI_KEY_INVALID','AI_PROJECT_RESTRICTED','AI_REGION_UNSUPPORTED','AI_CONFIG_UNSUPPORTED','AI_REQUEST_INVALID'].includes(data.code))error.code=data.code;throw error}
 const ids=new Set(questions.map(q=>q.id)),seen=new Set();
 if(!Array.isArray(data.answers)||data.answers.length!==questions.length||typeof data.model!=='string')throw Error('AI trả kết quả thiếu hoặc không hợp lệ.');
 for(const a of data.answers){const q=questions.find(q=>q.id===a.id);if(!ids.has(a.id)||seen.has(a.id)||typeof a.explanation!=='string'||!['answered','uncertain'].includes(a.status)||(a.status==='answered'&&!validSet(a.answer,q))||(a.status==='uncertain'&&a.answer!==''))throw Error('AI trả đáp án không hợp lệ.');seen.add(a.id)}
 for(const a of data.answers)if(a.kind!==undefined&&(!questions.find(q=>q.id===a.id)?.image||!['question','other','uncertain'].includes(a.kind)||!Array.isArray(a.labels)||a.labels.length>8||a.labels.some((label,i)=>label!==String.fromCharCode(65+i))||(a.kind==='question'&&a.labels.length<2)||(a.kind!=='question'&&(a.status!=='uncertain'||a.answer!==''))||(a.status==='answered'&&[...a.answer].some(label=>!a.labels.includes(label)))))throw Error('AI chưa phân loại được ảnh slide.');
 if(purpose==='explanation')for(const a of data.answers)if(a.status==='answered')validateOptionReasons(a.optionReasons,a.kind==='question'?a.labels:questions.find(q=>q.id===a.id).options.map(o=>o.id));
 return data;
}

