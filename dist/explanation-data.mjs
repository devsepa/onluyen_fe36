export function explanationKey(q){
 return JSON.stringify([3,q.sourceId,q.url,q.sharedDeck,q.sharedIndex,q.sourceVersion,q.stem,q.options.map(o=>[o.id,o.text]),[...q.answer].sort().join('')]);
}
export function validateOptionReasons(items,labels){
 if(!Array.isArray(labels)||labels.length<2||labels.length>8||new Set(labels).size!==labels.length||labels.some(id=>! /^[A-H]$/.test(id)))throw Error('Nhãn lựa chọn trong giải thích chưa hợp lệ.');
 if(!Array.isArray(items)||items.length!==labels.length)throw Error('AI chưa giải thích đủ các lựa chọn.');
 const seen=new Set();
 return labels.map(id=>{
  const item=items.find(item=>item?.id===id);
  if(!item||seen.has(id)||typeof item.text!=='string'||!item.text.trim()||item.text.length>3000||typeof item.reason!=='string'||!item.reason.trim()||item.reason.length>1500)throw Error('Giải thích lựa chọn của AI chưa hợp lệ.');
  seen.add(id);return {id,text:item.text.trim(),reason:item.reason.trim()};
 });
}
export function normalizeExplanation(q,result){
 if(result?.status!=='answered'||typeof result.explanation!=='string'||!result.explanation.trim()||result.explanation.length>3000)throw Error('AI chưa giải thích được câu này.');
 if(typeof result.answer!=='string'||[...result.answer].sort().join('')!==[...q.answer].sort().join(''))throw Error(`AI đề xuất đáp án ${result.answer||'chưa rõ'}, khác đáp án gốc ${q.answer}. Hãy đối chiếu slide; đáp án gốc vẫn được giữ.`);
 const labels=result.kind==='question'?result.labels:q.options.map(o=>o.id);
 const options=validateOptionReasons(result.optionReasons,labels);
 if(!q.image&&q.options.every(o=>o.text?.trim())&&options.some(o=>q.options.find(original=>original.id===o.id)?.text.trim()!==o.text))throw Error('AI đã thay đổi nội dung lựa chọn. Hãy đối chiếu câu hỏi và thử lại.');
 if([...q.answer].some(id=>!options.some(o=>o.id===id)))throw Error('AI chưa đọc đủ nội dung đáp án đúng.');
 if(result.tip!==undefined&&(typeof result.tip!=='string'||result.tip.length>1200))throw Error('Mẹo ghi nhớ chưa hợp lệ.');
 return {answer:q.answer,reason:result.explanation.trim(),options,...(result.tip?.trim()?{tip:result.tip.trim()}:{}),...(result.reused?{reused:true}:{}),...(/^[a-f0-9]{64}$/.test(result.cacheKey||'')&&typeof result.cacheEtag==='string'?{cacheKey:result.cacheKey,cacheEtag:result.cacheEtag.slice(0,100),reviewed:!!result.reviewed}:{})};
}
export function hasNoteExplanation(q){return typeof q?.explanation==='string'&&q.explanation.trim().length>0}
export function hasSpeakerNoteExplanation(q){return !!q?.explanation&&q.explanationSource!=='gemini'&&q.answerSource!=='gemini'}
export function upcomingExplanationQuestions(session,count=3){
 if(!session||session.done||session.mode!=='study')return [];
 const questions=[session.questions[session.current]];
 for(let step=1;step<session.questions.length&&questions.length<count;step++){
  const q=session.questions[(session.current+step)%session.questions.length];
  if(!session.answers[q.id])questions.push(q);
 }
 return questions.filter(Boolean);
}
