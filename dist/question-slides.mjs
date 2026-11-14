import {parsePresentation,detailsFromNotes} from './core.mjs?v=2026.11.14.32';
export function fastSlideKind(page,native,notes){
 if(native?.options?.length>=2&&native.options.every(o=>o.text?.trim()))return 'question';
 const text=(page.preview||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 if(/(?:link (?:tham khao|tim hieu|website)|cac khoa hoc|tham khao foruser|thong tin source|source & rule|https?:\/\/youtu)/.test(text))return 'other';
 if(page.images>0&&notes.answer)return 'question';
 return page.images>0?'inspect':'other';
}
export function inspectedQuestion(q,{result,model}){
 if(result.kind!=='question'||!Array.isArray(result.labels)||result.labels.length<2||result.labels.some((label,i)=>label!==String.fromCharCode(65+i)))return null;
 const question={...q,slideKind:'question',options:result.labels.map(id=>({id,text:''}))};
 if(!q.answer&&result.status==='answered'&&result.answer&&[...result.answer].every(label=>result.labels.includes(label)))Object.assign(question,{answer:result.answer,explanation:result.explanation,verified:false,answerSource:'gemini',aiModel:model,aiStatus:'proposed'});
 return question;
}
export async function selectQuestionSlides(p,{startSlide=1,endSlide=Infinity,maxQuestions=Infinity,signal,inspect,deferInspection=false,onProgress=()=>{},shouldStop=()=>false}={}){
 const parsed=parsePresentation(p),native=new Map(parsed.questions.map(q=>[q.slide,q])),questions=[],skipped=[],unresolved=[],pages=[],deferred=[];
 let unavailable=false;
 for(const page of parsed.diagnostics.pages){
  if(signal?.aborted)throw new DOMException('Đã dừng nhập.','AbortError');
  if(questions.length>=maxQuestions||shouldStop())break;if(page.slide<startSlide||page.slide>endSlide)continue;
  const slide=p.slides[page.slide-1],notes=detailsFromNotes(slide,'ABCDEFGH'.split('').map(id=>({id,text:''}))),known=native.get(page.slide),kind=fastSlideKind(page,known,notes);
  const options='ABCDEFGH'.slice(0,Math.max(4,...[...(notes.answer||'')].map(c=>c.charCodeAt(0)-64))).split('').map(id=>({id,text:''}));
  let q={id:crypto.randomUUID(),stem:`Câu hỏi slide ${page.slide}`,content:'',options,answer:notes.answer,explanation:notes.explanation,verified:!!notes.answer,answerSource:notes.answer?'speaker-notes':null,slide:page.slide,url:`https://docs.google.com/presentation/d/${encodeURIComponent(p.presentationId)}/edit#slide=id.${encodeURIComponent(slide.objectId)}`,extraction:'ocr',slideKind:'question'};
  let accepted=kind==='question',reason=kind;
  if(accepted&&known?.options.every(o=>o.text?.trim()))q={...known,extraction:'ocr',slideKind:'question'};
  if(kind==='inspect'&&inspect&&deferInspection)deferred.push({...q,slideKind:'pending'});
  if(kind==='inspect'&&inspect&&!deferInspection&&!unavailable){
   try{
    const {result,model}=await inspect(q,slide);
    if(signal?.aborted)throw new DOMException('Đã dừng nhập.','AbortError');
    const inspected=inspectedQuestion(q,{result,model});if(inspected){q=inspected;accepted=true;reason='question'}else reason=result.kind==='other'?'other':'uncertain';
   }catch(error){if(error.name==='AbortError')throw error;reason='uncertain';unavailable=error.code!=='AI_IMAGE_INVALID'}
  }
  if(accepted)questions.push(q);else if(reason==='other')skipped.push(page.slide);else unresolved.push(page.slide);
  pages.push({...page,recognized:accepted,classification:accepted?'question':reason});onProgress({slide:page.slide,totalSlides:p.slides.length,found:questions.length,skipped:skipped.length,unresolved:unresolved.length});
 }
 const visited=new Set(pages.map(page=>page.slide)),unread=parsed.diagnostics.pages.filter(page=>page.slide>=startSlide&&page.slide<=endSlide&&!visited.has(page.slide)).map(page=>page.slide);
 return {questions,skipped,unresolved,deferred,diagnostics:{...parsed.diagnostics,pages,excluded:skipped.length,unresolved:unresolved.length,unread}};
}
