export function questionFingerprint(q){return JSON.stringify([q.sourceId,q.url,q.stem,q.options.map(o=>[o.id,o.text])])}
export function applyAiResults(bank,submitted,results,model){
 const sent=new Map(submitted.map(q=>[q.id,q]));let applied=0,uncertain=0;
 const seen=new Set();
 for(const result of results){
  const original=sent.get(result.id),q=bank.find(q=>q.id===result.id);
  if(!original||!q||q.answer||seen.has(q.id)||questionFingerprint(q)!==questionFingerprint(original))continue;
  seen.add(q.id);
  if(result.status==='answered'&&q.options.some(o=>o.id===result.answer)&&typeof result.explanation==='string'){
   q.answer=result.answer;q.explanation=result.explanation.slice(0,3000);q.verified=false;q.answerSource='gemini';q.aiModel=model;q.aiStatus='proposed';applied++;
  }else if(result.status==='uncertain'){q.aiStatus='uncertain';q.aiReason=String(result.explanation||'AI chưa xác định được đáp án.').slice(0,3000);uncertain++}
 }
 return {applied,uncertain};
}
export async function solveBatch(base,questions,token,{signal,fetcher=fetch}={}){
 const url=new URL(base);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('Dịch vụ AI chưa sẵn sàng.');
 const response=await fetcher(new URL('/v1/answers',url),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({questions:questions.map(q=>({id:q.id,stem:q.stem,options:q.options}))}),signal});
 let data;try{data=await response.json()}catch{throw Error('Không đọc được phản hồi AI. Kết quả trước đó vẫn được giữ.')}
 if(!response.ok)throw Error(typeof data.error==='string'?data.error:'AI đang bận. Hãy tiếp tục sau.');
 const ids=new Set(questions.map(q=>q.id)),seen=new Set();
 if(!Array.isArray(data.answers)||data.answers.length!==questions.length||typeof data.model!=='string')throw Error('AI trả kết quả thiếu hoặc không hợp lệ.');
 for(const a of data.answers){const q=questions.find(q=>q.id===a.id);if(!ids.has(a.id)||seen.has(a.id)||typeof a.explanation!=='string'||!['answered','uncertain'].includes(a.status)||(a.status==='answered'&&!q.options.some(o=>o.id===a.answer))||(a.status==='uncertain'&&a.answer!==''))throw Error('AI trả đáp án không hợp lệ.');seen.add(a.id)}
 return data;
}
