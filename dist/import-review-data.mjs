import {cleanQuestion,detailsFromNotes,textOf,cleanSlideContent,normalizeAnswer} from './core.mjs';
export const reviewLabels={ready:'Đã nhập',check:'Cần đối chiếu lựa chọn',unknown:'Chưa nhận diện',skipped:'Đã bỏ qua',unread:'Chưa quét do giới hạn',outside:'Ngoài phạm vi chọn',approved:'Đã duyệt thủ công',rejected:'Không phải câu hỏi'};
export function buildSlideReview(p,parsed,resource={},range={}){
 const pages=new Map((parsed.diagnostics?.pages||[]).map(page=>[page.slide,page])),questions=new Map((parsed.questions||[]).map(q=>[q.slide,q]));
 const version=p.revisionId||resource.modifiedTime||null;
 return {id:p.presentationId,name:p.title||resource.name||'Tài liệu',version,updatedAt:Date.now(),slides:(p.slides||[]).map((slide,i)=>{
  const n=i+1,page=pages.get(n),known=questions.get(n),notes=detailsFromNotes(slide,'ABCDEFGH'.split('').map(id=>({id,text:''})));
  const url=`https://docs.google.com/presentation/d/${encodeURIComponent(p.presentationId)}/edit#slide=id.${encodeURIComponent(slide.objectId)}`;
  const question=cleanQuestion({...known,id:known?.id||crypto.randomUUID(),sourceId:p.presentationId,sourceName:p.title||resource.name||'Tài liệu',sourceVersion:version,slide:n,url,stem:known?.stem||`Câu hỏi slide ${n}`,options:known?.options||'ABCD'.split('').map(id=>({id,text:''})),answer:known?.answer||notes.answer,explanation:known?.explanation||notes.explanation,verified:!!(known?.verified||notes.answer),answerSource:known?.answerSource||(notes.answer?'speaker-notes':null),extraction:'ocr'});
  let status=n<(range.startSlide||1)||n>(range.endSlide||Infinity)?'outside':!page?'unread':known?(question.options.every(o=>o.text?.trim())&&question.answer?'ready':'check'):page.classification==='other'?'skipped':'unknown';
  return {slide:n,objectId:slide.objectId,url,status,imageStatus:'unloaded',reason:page?.importError||(status==='unread'?'Chưa đọc do giới hạn số câu hoặc đã dừng nhập.':status==='unknown'?'Chưa đủ dữ liệu để nhận diện. Cần đối chiếu ảnh gốc.':''),preview:cleanSlideContent(page?.preview||textOf(slide.pageElements||[])),question};
 })};
}
export function needsSlideReview(row){return row.imageStatus==='error'||['check','unknown','unread'].includes(row.status)}
export function manualReviewQuestion(row,{stem,options,answer,explanation}){
 if(typeof stem!=='string'||!stem.trim())throw Error('Nhập nội dung hoặc tên câu hỏi để lưu.');
 if(!Array.isArray(options)||options.length<2||options.length>8||options.some((o,i)=>o.id!==String.fromCharCode(65+i)))throw Error('Cần 2–8 lựa chọn theo đúng thứ tự A–H.');
 const correct=normalizeAnswer(answer,options);if(!correct)throw Error('Nhập đủ đáp án hợp lệ, ví dụ AE, ACE.');
 if(row.imageStatus!=='ok'&&!options.every(o=>o.text?.trim()))throw Error('Ảnh chưa tải được: hãy nhập đầy đủ nội dung các lựa chọn hoặc tải lại ảnh trước khi duyệt.');
 return cleanQuestion({...row.question,stem:stem.trim(),content:'',options,answer:correct,explanation:explanation||'',answerSource:'manual',explanationSource:explanation?'manual':null,verified:true,choiceCountSource:'manual',manuallyReviewedAt:Date.now(),explanationDetails:undefined,tip:undefined,aiStatus:null,aiModel:null});
}
