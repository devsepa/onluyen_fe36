export const SLIDES_MIME='application/vnd.google-apps.presentation';
export const GOOGLE_SCOPES=[
 'openid','https://www.googleapis.com/auth/userinfo.profile','https://www.googleapis.com/auth/userinfo.email',
 'https://www.googleapis.com/auth/presentations.readonly',
 'https://www.googleapis.com/auth/drive.metadata.readonly'
];

// Treat underscores, spaces and dashes as separators, including inside long names.
export function isSuggestedResource(name){
 return /(?:^|[^a-z0-9])(?:semester|semeter|sever)[\s_-]*\d+(?=$|[^a-z0-9])/i.test(String(name));
}
export function suggestedResources(files){
 return files.filter(f=>f.mimeType===SLIDES_MIME&&!f.trashed&&isSuggestedResource(f.name));
}
export function presentationIdFromLink(value){
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='docs.google.com'?url.pathname.match(/^\/presentation\/d\/([\w-]+)(?:\/|$)/)?.[1]||null:null}catch{return null}
}
export async function listSlides(request){
 const files=new Map();let pageToken;
 do{
  const query=new URLSearchParams({q:`trashed = false and mimeType = '${SLIDES_MIME}'`,spaces:'drive',corpora:'user',pageSize:'100',fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime)',orderBy:'modifiedTime desc',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
  if(pageToken)query.set('pageToken',pageToken);
  const page=await request(`https://www.googleapis.com/drive/v3/files?${query}`);
  if(page.incompleteSearch)throw Error('Google chưa tìm đủ tài liệu. Hãy thử tìm lại hoặc dán link slide để chọn trực tiếp.');
  for(const f of page.files||[])if(f.mimeType===SLIDES_MIME&&!f.trashed)files.set(f.id,f);
  pageToken=page.nextPageToken;
 }while(pageToken);
 return [...files.values()];
}
export async function readSelectedResources(resources,request,parse,onProgress=()=>{},shouldStop=()=>false){
 const questions=[],sources=[],failures=[],diagnostics=[],deferred=[];
 const unique=[...new Map(resources.map(r=>[r.id,r])).values()];
 for(const [i,resource] of unique.entries()){
  if(shouldStop())break;
  onProgress(i+1,unique.length,resource.name);
  try{
   const p=await request(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(resource.id)}`);
   if(p.presentationId!==resource.id)throw Error('Tài liệu trả về không khớp nguồn đã chọn.');
   const parsed=await parse(p,resource);
   if(parsed.diagnostics)diagnostics.push({id:resource.id,name:p.title||resource.name,...parsed.diagnostics});
   if(!parsed.questions.length&&!parsed.deferred?.length){const d=parsed.diagnostics;throw Error(d?`Đã đọc ${d.totalSlides} slide: ${d.textSlides} slide có chữ, ${d.imageSlides} slide có ảnh; chưa nhận diện được câu trắc nghiệm. Xem Chi tiết nhập tài liệu bên dưới để kiểm tra.`:'Không tìm được câu hỏi trắc nghiệm dạng chữ.');}
   const name=p.title||resource.name;
   sources.push({id:resource.id,name,count:parsed.questions.length,skipped:parsed.skipped,remaining:parsed.diagnostics?.unread?.length??parsed.diagnostics?.ocrRemaining??0});
   questions.push(...parsed.questions.map(q=>({...q,sourceId:resource.id,sourceName:name,sourceVersion:p.revisionId||resource.modifiedTime||null})));
   deferred.push(...(parsed.deferred||[]).map(q=>({...q,sourceId:resource.id,sourceName:name,sourceVersion:p.revisionId||resource.modifiedTime||null})));
  }catch(error){if(error.name==='AbortError')throw error;failures.push({id:resource.id,name:resource.name,error:error.message});}
 }
 return {questions,sources,failures,diagnostics,...(deferred.length?{deferred}:{})};
}
