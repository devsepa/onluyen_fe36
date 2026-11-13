import {validateLibraryQuestions,sha256,imageMime,MAX_LIBRARY_BYTES} from './library-data.mjs';
import {writeBackupZip,readBackupZip} from './backup-zip.mjs';
import {explanationKey} from './explanation-data.mjs';
export async function prepareLibraryQuestions(questions,{media,getBlob,getDetails=()=>null,signal,onProgress=()=>{}}){
 const output=structuredClone(questions),images=new Map();let bytes=0;
 for(let i=0;i<output.length;i++){
  signal?.throwIfAborted();const q=output[i],details=getDetails(q);if(details)q.explanationDetails={...details,key:explanationKey(q)};
  if(q.url||q.sharedDeck||q.mediaId){
   let blob=media.forQuestion?await media.forQuestion(q):q.mediaId?await media.get(q.mediaId):null;
   if(!blob)try{blob=await getBlob(q,{signal,maxBytes:2100000})}catch(error){if(error.name==='AbortError')throw error;throw Error(`Chưa lấy được ảnh slide ${q.slide} (${q.sourceName||'tài liệu'}). Kết nối Google hoặc kiểm tra nguồn rồi thử lại. Chưa tạo bản sao lưu thiếu ảnh.`)}
   signal?.throwIfAborted();q.mediaId=await media.put(blob);await media.link?.(q,q.mediaId);
   if(!images.has(q.mediaId)){images.set(q.mediaId,blob);bytes+=blob.size;if(bytes>MAX_LIBRARY_BYTES)throw Error('Ảnh thư viện vượt 200 MB. Hãy xuất từng môn hoặc giảm số ảnh trước khi đồng bộ.')}
  }
  onProgress({current:i+1,total:output.length,bytes});
 }
 return {questions:validateLibraryQuestions(output),images};
}
export async function createCompleteBackup(questions,options){
 const prepared=await prepareLibraryQuestions(questions,options),images=[],files=new Map();
 for(const [id,blob]of prepared.images){const bytes=new Uint8Array(await blob.arrayBuffer());images.push({id,mimeType:imageMime(bytes),size:bytes.length});files.set('images/'+id,bytes)}
 const manifest={format:'slide-on-thi/complete-v2',createdAt:new Date().toISOString(),questions:prepared.questions,images};
 const json=JSON.stringify(manifest);if(new TextEncoder().encode(json).length>16*1024*1024)throw Error('Nội dung quá lớn cho một bản sao lưu. Hãy xuất riêng từng môn.');files.set('manifest.json',json);
 return {...prepared,blob:writeBackupZip(files)};
}
export async function readCompleteBackup(file){
 const files=readBackupZip(await file.arrayBuffer());if(files.get('manifest.json').byteLength>16*1024*1024)throw Error('Thông tin sao lưu vượt giới hạn.');const text=new TextDecoder('utf-8',{fatal:true}).decode(files.get('manifest.json'));
 let manifest;try{manifest=JSON.parse(text)}catch{throw Error('Thông tin sao lưu bị hỏng.')}
 if(manifest.format!=='slide-on-thi/complete-v2'||!Array.isArray(manifest.images)||manifest.images.length>5000)throw Error('Không nhận diện được bản sao lưu trọn bộ.');
 const questions=validateLibraryQuestions(manifest.questions),images=new Map();let total=0;
 for(const entry of manifest.images){const bytes=files.get('images/'+entry.id);if(!bytes||images.has(entry.id)||bytes.length!==entry.size||bytes.length>2100000||imageMime(bytes)!==entry.mimeType||await sha256(bytes)!==entry.id)throw Error('Ảnh trong sao lưu bị thiếu, bị hỏng hoặc không khớp mã kiểm tra.');total+=bytes.length;if(total>MAX_LIBRARY_BYTES)throw Error('Ảnh sao lưu vượt 200 MB.');images.set(entry.id,new Blob([bytes],{type:entry.mimeType}))}
 if(files.size!==images.size+1||questions.some(q=>(q.url||q.sharedDeck||q.mediaId)&&!images.has(q.mediaId)))throw Error('Sao lưu chưa chứa đủ ảnh của các câu hỏi.');
 return {questions,images};
}
