import {presentationIdFromLink} from './resources.mjs';
import {cleanQuestion} from './core.mjs?v=20261113-order-10';
export function validateBank(data){
 if(data?.format!=='slide-on-thi/v1'||!Array.isArray(data.questions)||!data.questions.length||data.questions.length>5000)throw Error('File không phải bộ câu hỏi Slide Ôn Thi hợp lệ (tối đa 5.000 câu).');
 return data.questions.map((q,index)=>{
  const id=presentationIdFromLink(q.url);
  if(!id||q.sourceId!==id||typeof q.stem!=='string'||!q.stem.trim()||q.stem.length>20000||!Array.isArray(q.options)||q.options.length<2||q.options.length>8)throw Error(`Câu ${index+1} thiếu nguồn Google Slides hoặc nội dung không hợp lệ.`);
  const ids=new Set();const options=q.options.map(o=>{if(!/^[A-H]$/.test(o.id)||ids.has(o.id)||typeof o.text!=='string'||!o.text.trim()||o.text.length>20000)throw Error(`Các lựa chọn ở câu ${index+1} không hợp lệ.`);ids.add(o.id);return{id:o.id,text:o.text}});
  const answer=ids.has(q.answer)?q.answer:'';
  return cleanQuestion({id:crypto.randomUUID(),stem:q.stem.trim(),options,answer,verified:!!answer&&q.verified===true,sourceId:id,sourceName:String(q.sourceName||'Tài liệu đã nhập').slice(0,300),slide:Number.isInteger(q.slide)&&q.slide>0?q.slide:1,url:q.url,extraction:q.extraction==='ocr'?'ocr':'text'});
 });
}
