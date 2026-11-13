import {parsePresentation,textOf} from './core.mjs?v=20261113-notes-12';

export function checkAbort(signal){if(signal?.aborted)throw new DOMException('Đã dừng nhập tài liệu.','AbortError')}
export async function cacheKey(p,slide,resource={}){
 // A revision/modified time is required for persistent reuse, so edited slides are not stale.
 const version=resource.modifiedTime||p.revisionId;if(!version)return null;
 const stable=JSON.stringify(slide,(key,value)=>key==='contentUrl'?undefined:value);
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable));
 return `ocr-v1:${p.presentationId}:${slide.objectId}:${version}:`+[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function directImageUrl(slide){
 const elements=slide.pageElements||[];
 const flatten=items=>items.flatMap(e=>e.elementGroup?flatten(e.elementGroup.children||[]):[e]);
 const images=flatten(elements).filter(e=>e.image);
 const background=slide.pageProperties?.pageBackgroundFill?.stretchedPictureFill?.contentUrl;
 // A single uncropped raster can be read directly, with no thumbnail-generation request.
 if(!textOf(elements).trim()&&images.length===1&&!background){
  const image=images[0].image,crop=image.imageProperties?.cropProperties||{};
  if(image.contentUrl&&!Object.values(crop).some(value=>typeof value==='number'&&Math.abs(value)>1e-8))return image.contentUrl;
 }
 if(!elements.length)return background||null;
 return null;
}
export async function parseWithOcr(p,resource,{request,recognize,cache,signal,onProgress=()=>{},concurrency=1,maxQuestions=Infinity,startSlide=1,endSlide=Infinity,shouldStop=()=>false}){
 const original=parsePresentation(p),pages=original.diagnostics.pages;
 const inRange=page=>page.slide>=startSlide&&page.slide<=endSlide;
 const questions=[],native=new Map(original.questions.map(q=>[q.slide,q]));
 const orderedPages=pages.filter(inRange);
 const targets=pages.filter(page=>inRange(page)&&!page.recognized&&page.images>0);
 let completed=0,cached=0,cursor=0;
 function progress(page,done=false){onProgress({slide:page?.slide,totalSlides:p.slides.length,completed,total:targets.length,found:Math.min(questions.length,maxQuestions),cached,done})}
 async function process(page){
  checkAbort(signal);const slide=p.slides[page.slide-1];
  page.processed=true;
  if(native.has(page.slide))return native.get(page.slide);
  if(!page.images)return null;
  try{
   const key=await cacheKey(p,slide,resource);checkAbort(signal);
   let result=key?await cache?.get(key):null;
   if(result&&typeof result.text==='string')cached++;
   else{
    const direct=directImageUrl(slide);
    if(direct){
     try{result=await recognize(direct,signal)}catch(error){checkAbort(signal);if(error.ocrFatal)throw error;}
    }
    if(!result){
     const thumbnail=await request(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(p.presentationId)}/pages/${encodeURIComponent(slide.objectId)}/thumbnail?thumbnailProperties.thumbnailSize=LARGE`);
     checkAbort(signal);result=await recognize(thumbnail.contentUrl,signal);
    }
    checkAbort(signal);
    if(key)await cache?.put(key,{text:result.text,confidence:result.confidence});
   }
   // Keep original speaker notes; replace only page text with the OCR result.
   const parsed=parsePresentation({...p,slides:[{...slide,pageElements:[{shape:{text:{textElements:[{textRun:{content:result.text}}]}}}]}]});
   const q=parsed.questions[0];
   page.ocr=true;page.ocrConfidence=result.confidence;page.preview=result.text.slice(0,1200);
   if(q){q.slide=page.slide;q.extraction='ocr';q.ocrConfidence=result.confidence;page.recognized=true;return q;}
  }catch(error){checkAbort(signal);if(error.ocrFatal)throw error;page.ocrError=error.message;}
  return null;
 }
 // Read consecutive batches, then commit in original order, regardless of worker completion time.
 // Native-text questions never jump ahead of earlier image questions at the count limit.
 const size=Math.max(1,Math.min(4,Math.floor(concurrency)||1));
 while(cursor<orderedPages.length&&!shouldStop()&&questions.length<maxQuestions){
  checkAbort(signal);
  const batch=orderedPages.slice(cursor,cursor+Math.min(size,maxQuestions-questions.length));cursor+=batch.length;
  progress(batch[0]);
  const results=await Promise.all(batch.map(process));
  for(const [i,page] of batch.entries()){
   if(results[i])questions.push(results[i]);
   if(page.ocr||page.ocrError)completed++;
   progress(page);
  }
 }
 checkAbort(signal);
 questions.sort((a,b)=>a.slide-b.slide);
 progress(null,true);
 const remaining=targets.filter(page=>!page.ocr&&!page.ocrError).length;
 return {questions:questions.slice(0,maxQuestions),skipped:pages.filter(page=>page.processed&&!page.recognized).map(page=>page.slide),diagnostics:{...original.diagnostics,ocrAttempted:completed,ocrRemaining:remaining,unread:orderedPages.filter(page=>!page.processed).map(page=>page.slide),ocrCached:cached,ocrErrors:pages.filter(page=>page.ocrError).length,pages}};
}
