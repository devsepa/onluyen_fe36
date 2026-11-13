export function questionFingerprint(q){return JSON.stringify([q.sourceId,q.url,q.stem,q.options.map(o=>[o.id,o.text])])}
export function readyForPractice(q){return !!q.answer&&(q.verified===true||q.answerSource==='gemini')}
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
export async function blobToBase64(blob){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result.split(',')[1]);
  reader.onerror=reject;
  reader.readAsDataURL(blob);
 });
}
export async function verifyOrSolveWithDirectGemini(apiKey,q,imageBlob,{checkExisting=false,model='gemini-2.5-flash',signal}={}){
 if(!apiKey||!/^AIza[a-zA-Z0-9_-]{30,}$/.test(apiKey.trim()))throw Error('Gemini API Key không hợp lệ. Hãy kiểm tra lại key từ Google AI Studio.');
 const parts=[];
 if(imageBlob){
  const b64=await blobToBase64(imageBlob);
  parts.push({inlineData:{mimeType:imageBlob.type||'image/png',data:b64}});
 }
 const prompt=checkExisting
  ? `Bạn là trợ lý kiểm tra đề thi trắc nghiệm từ hình ảnh slide. Đọc kỹ hình ảnh slide (đề bài, câu hỏi, các lựa chọn A, B, C, D...).
Đáp án hiện tại trong ghi chú là: "${q.answer||''}".
Nhiệm vụ:
1. Giải câu hỏi trong slide để tìm đáp án chính xác nhất (A, B, C hoặc D...).
2. Kiểm tra xem đáp án ghi chú ("${q.answer}") có ĐÚNG không.
3. Trả về đúng JSON theo định dạng sau:
{"bestAnswer":"A hoặc B hoặc C hoặc D","isCurrentCorrect":true hoặc false,"explanation":"Giải thích ngắn gọn lý do chọn đáp án này bằng tiếng Việt"}`
  : `Bạn là trợ lý giải đề thi trắc nghiệm từ hình ảnh slide. Đọc kỹ hình ảnh slide (đề bài, câu hỏi, các lựa chọn A, B, C, D...).
Nhiệm vụ:
1. Giải câu hỏi trong slide để tìm đáp án chính xác nhất (A, B, C hoặc D...).
2. Trả về đúng JSON theo định dạng sau:
{"bestAnswer":"A hoặc B hoặc C hoặc D","explanation":"Giải thích ngắn gọn lý do chọn đáp án này bằng tiếng Việt"}`;
 parts.push({text:prompt});
 const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
 const schema=checkExisting?{
  type:'OBJECT',
  properties:{
   bestAnswer:{type:'STRING'},
   isCurrentCorrect:{type:'BOOLEAN'},
   explanation:{type:'STRING'}
  },
  required:['bestAnswer','isCurrentCorrect','explanation']
 }:{
  type:'OBJECT',
  properties:{
   bestAnswer:{type:'STRING'},
   explanation:{type:'STRING'}
  },
  required:['bestAnswer','explanation']
 };
 const res=await fetch(url,{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({
   contents:[{role:'user',parts}],
   generationConfig:{temperature:0.1,maxOutputTokens:2048,responseMimeType:'application/json',responseSchema:schema}
  }),
  signal
 });
 if(!res.ok){
  const err=await res.json().catch(()=>({}));
  throw Error(err.error?.message||`Lỗi gọi Gemini (${res.status}).`);
 }
 const data=await res.json();
 const text=data.candidates?.[0]?.content?.parts?.[0]?.text;
 if(!text)throw Error('Gemini không trả về kết quả.');
 return JSON.parse(text);
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

