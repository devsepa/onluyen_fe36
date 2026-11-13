import {checkAbort} from './ocr.mjs';

const OCR_SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
let scriptPromise;
function loadEngine(){
 if(window.Tesseract)return Promise.resolve(window.Tesseract);
 if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=OCR_SCRIPT;script.async=true;
  script.onload=()=>resolve(window.Tesseract);script.onerror=()=>{script.remove();scriptPromise=null;reject(Error('Không tải được bộ OCR. Kiểm tra mạng hoặc trình chặn nội dung rồi thử lại.'))};document.head.append(script);
 });
 return scriptPromise;
}
export function createBrowserRecognizer({onStatus=()=>{},language='eng+vie'}={}){
 let worker=null,creating=null,closed=false;
 async function terminate(){closed=true;const instance=worker;worker=null;if(instance)await instance.terminate()}
 return {
  async recognize(url,signal){
   checkAbort(signal);if(closed)throw new DOMException('Đã dừng OCR.','AbortError');
   if(!creating){
    onStatus('Đang chuẩn bị bộ nhận dạng chữ…');
    creating=(async()=>{
     const Tesseract=await loadEngine();checkAbort(signal);
     const instance=await Tesseract.createWorker(language,1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',logger:m=>{if(!closed&&m.status==='recognizing text')onStatus(`Đang nhận dạng chữ ${Math.round((m.progress||0)*100)}%`)}});
     if(closed||signal?.aborted){await instance.terminate();checkAbort(signal);throw new DOMException('Đã dừng OCR.','AbortError')}
     worker=instance;return instance;
    })().catch(error=>{error.ocrFatal=true;throw error});
   }
   const instance=await creating;checkAbort(signal);
   // Signed thumbnail URL is fetched from Google only. Never forward the OAuth token.
   const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
   if(!response.ok)throw Error('Không tải được ảnh slide từ Google. Hãy kết nối lại rồi thử tiếp.');
   const blob=await response.blob();checkAbort(signal);
   let abort;
   const aborted=new Promise((_,reject)=>{abort=()=>{terminate().catch(()=>{});reject(new DOMException('Đã dừng OCR.','AbortError'))};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()});
   try{const result=await Promise.race([instance.recognize(blob),aborted]);checkAbort(signal);return {text:result.data.text,confidence:result.data.confidence}}
   finally{signal?.removeEventListener('abort',abort)}
  },terminate
 };
}
export function createBrowserPool({size=2,...options}={}){
 const workers=Array.from({length:Math.max(1,Math.min(size,4))},()=>({reader:createBrowserRecognizer(options),busy:false}));
 return {
  async recognize(url,signal){
   checkAbort(signal);const slot=workers.find(w=>!w.busy);
   if(!slot)throw Error('OCR đang xử lý đủ số tác vụ.');
   slot.busy=true;try{return await slot.reader.recognize(url,signal)}finally{slot.busy=false}
  },
  async terminate(){await Promise.allSettled(workers.map(w=>w.reader.terminate()))}
 };
}
export function createOcrCache(){
 let dbPromise;
 function database(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
   const request=indexedDB.open('slide-on-thi-ocr',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('pages');
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });return dbPromise;
 }
 return {
  async get(key){try{const db=await database();return await new Promise(resolve=>{const req=db.transaction('pages').objectStore('pages').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null)})}catch{return null}},
  async put(key,value){try{const db=await database();await new Promise(resolve=>{const tx=db.transaction('pages','readwrite');tx.objectStore('pages').put(value,key);tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve})}catch{/* Cache unavailable: continue without persistent caching. */}}
 };
}
