import {GOOGLE_SCOPES,listSlides,suggestedResources,presentationIdFromLink,readSelectedResources} from './resources.mjs';
import {resolveGoogleClientId,AI_API_BASE} from './site-config.mjs';
import {solveBatch,blobToBase64} from './ai.mjs?v=20261113-instant-import-1';
import {selectQuestionSlides,inspectedQuestion} from './question-slides.mjs?v=20261113-instant-import-1';
import {createGoogleReadQueue,abortableResult} from './google-read-queue.mjs';
import {createSlideBlobCache} from './slide-blob-cache.mjs';
import {directSlideImage} from './direct-slide-image.mjs';
import {detailsFromNotes,speakerNotesText} from './core.mjs?v=20261113-filter-1';

const $=id=>document.getElementById(id);
export function setupResources({message,onImport,onDeferredQuestion=()=>false,hasActiveSession,onAccountChange=()=>{},onAccountError=message}){
 let token=null,expires=0,files=[],suggestions=[],selected=new Map(),controller=null,busy=false,epoch=0;
 let expiryTimer,profileController;
 let accountProfile=null,classifying=false,backgroundId=0;
 const sessionKey='sot-google-session';
 function saveConnection(){try{if(token&&expires>Date.now())sessionStorage.setItem(sessionKey,JSON.stringify({token,expires,profile:accountProfile,clientId:resolveGoogleClientId()}));else sessionStorage.removeItem(sessionKey)}catch{}}
 function updateProfile(profile){accountProfile=profile;saveConnection();onAccountChange(profile)}
 const thumbnailCache=new Map(),presentations=new Map(),thumbnailQueue=createGoogleReadQueue(),slideBytes=createSlideBlobCache({owner:()=>accountProfile?.email,load:loadSlideBlob});
 function rememberPresentation(p){presentations.set(p.presentationId,{created:Date.now(),promise:Promise.resolve(p)})}
 function expireConnection(){backgroundId++;classifying=false;thumbnailCache.clear();presentations.clear();slideBytes.clear();token=null;expires=0;updateProfile(null)}
 function scheduleExpiry(){clearTimeout(expiryTimer);expiryTimer=setTimeout(expireConnection,Math.max(0,expires-Date.now()))}
 function status(text){$('resourceStatus').textContent=text}
 const sourceNote=document.querySelector('.source-note');if(sourceNote)sourceNote.textContent='Chỉ nhập slide có câu hỏi và lựa chọn. Giữ nguyên ảnh, ngôn ngữ, thứ tự đáp án và số slide gốc. Bỏ trang quảng cáo, giới thiệu và danh sách link.';
 const diagnosticsPanel=document.createElement('details');
 diagnosticsPanel.id='importDiagnostics';diagnosticsPanel.hidden=true;$('resourceStatus').after(diagnosticsPanel);
 const stopButton=document.createElement('button');stopButton.className='secondary';stopButton.type='button';stopButton.textContent='Dừng nhập';stopButton.hidden=true;$('resourceStatus').after(stopButton);
 stopButton.onclick=()=>{controller?.abort();status('Đã dừng nhập tài liệu.')};
 const progressPanel=document.createElement('section');progressPanel.className='import-progress';progressPanel.hidden=true;
 progressPanel.innerHTML='<div class="progress-heading"><strong id="ocrHeadline">Đang chuẩn bị tài liệu</strong><span id="ocrPercent">0%</span></div><progress id="ocrBar" max="100" value="0"></progress><div class="progress-metrics"><span id="ocrCount">0 câu đã nhận diện</span><span id="ocrTime">Đang ước tính…</span></div><p id="ocrDetail">Hiển thị ảnh slide gốc, không chép lại nội dung bằng OCR. Đáp án và giải thích lấy từ ghi chú.</p><button id="useReady" type="button" hidden>Dùng các câu đã đọc</button>';
 $('resourceStatus').after(progressPanel);progressPanel.append(stopButton);
 let finishEarly=false;
 $('useReady').onclick=()=>{finishEarly=true;$('useReady').disabled=true;$('useReady').textContent='Đang hoàn tất các trang đang đọc…'};
 function showDiagnostics(reports=[]){
  diagnosticsPanel.replaceChildren();diagnosticsPanel.hidden=!reports.length;
  const heading=document.createElement('summary');heading.textContent='Chi tiết nhập tài liệu';diagnosticsPanel.append(heading);
  for(const report of reports){
   const title=document.createElement('p');title.textContent=`${report.name}: ${report.totalSlides} slide · bỏ ${report.excluded||0} trang không phải câu hỏi · ${report.unresolved||0} trang chưa xác định, chưa nhập.`;diagnosticsPanel.append(title);
  }
 }
 function active(){return token&&Date.now()<expires}
 function reset(){clearTimeout(expiryTimer);profileController?.abort();expireConnection();stopButton.hidden=true;progressPanel.hidden=true;diagnosticsPanel.hidden=true;for(const id of ['ocrLimit','ocrStart','ocrEnd'])if($(id))$(id).disabled=false;epoch++;controller?.abort();controller=null;files=[];suggestions=[];selected.clear();busy=false;renderSelected();renderFiles([]);$('scan').disabled=false;$('chooseFiles').disabled=false;$('import').disabled=false;$('useResources').disabled=false;if($('filePicker').open)$('filePicker').close()}
 function delay(ms,signal){return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new DOMException('Đã dừng.','AbortError'));
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Đã dừng.','AbortError'))};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms);signal?.addEventListener('abort',abort,{once:true});
 })}
 async function request(url,{signal:externalSignal,onWait=()=>{}}={}){
  const signal=externalSignal||(controller?.signal.aborted?undefined:controller?.signal),thumbnail=url.includes('/thumbnail?');
  for(let attempt=0;attempt<5;attempt++){
  if(thumbnail)await thumbnailQueue.reserve(signal,onWait);
  if(!active())throw Object.assign(Error('Phiên Google đã hết hạn. Bấm Kết nối Google để tiếp tục.'),{ocrFatal:true});
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal});
  if((r.status===429||r.status>=500)&&attempt<4){const header=r.headers.get('Retry-After'),after=header?(Number.isFinite(Number(header))?Number(header)*1000:Math.max(0,Date.parse(header)-Date.now())):0,ms=Math.max(after||0,r.status===429?60000:2**attempt*1000+Math.random()*500);if(thumbnail&&r.status===429)thumbnailQueue.pause(ms);onWait({ms,reason:r.status===429?'quota':'network'});await delay(ms,signal);continue;}
  if(!r.ok){
   if(r.status===401){expireConnection();throw Object.assign(Error('Quyền đọc Google đã hết hạn. Kết nối lại ở ảnh đại diện khi cần đọc slide; câu đã lưu vẫn ôn bình thường.'),{ocrFatal:true});}
   if(r.status===403||r.status===404)throw Error('Chưa truy cập được tài liệu. Hãy dùng đúng tài khoản Google có quyền xem tài liệu rồi thử lại.');
   throw Object.assign(Error(r.status===429?'Google đang giới hạn lượt tải ảnh (429). Phần tải lên đã có được giữ lại; hãy tiếp tục sau.':`Google trả lỗi ${r.status}. Hãy thử lại.`),{status:r.status});
  }
  return r.json();
  }
 }
 function renderSelected(){
  $('selectedResources').replaceChildren();
  const visible=new Map([...suggestions,...selected.values()].map(r=>[r.id,r]));
  for(const r of visible.values()){
   const item=document.createElement('label');item.className='resource-item resource-choice';
   const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(r.id);checkbox.disabled=busy;
   checkbox.onchange=()=>{if(checkbox.checked)selected.set(r.id,r);else selected.delete(r.id);renderSelected();renderFiles(files)};
   const label=document.createElement('span');label.textContent=r.name;
   item.append(checkbox,label);$('selectedResources').append(item);
  }
  $('useResources').textContent=selected.size?`Dùng ${selected.size} tài liệu đã chọn →`:'Chọn tài liệu để tiếp tục';
  $('useResources').hidden=!visible.size;
  $('useResources').disabled=busy||!selected.size;
 }
 function renderFiles(items){
  const term=$('resourceSearch').value.trim().toLowerCase();
  const visible=items.filter(f=>f.name.toLowerCase().includes(term));
  $('fileList').replaceChildren();
  if(!visible.length){const empty=document.createElement('p');empty.textContent=files.length?'Không có slide khớp từ khóa.':'Chưa có Google Slides trong danh sách. Bạn có thể dán link tài liệu bên ngoài hộp chọn.';$('fileList').append(empty)}
  for(const f of visible){
   const label=document.createElement('label');label.className='resource-item';
   const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selected.has(f.id);checkbox.disabled=busy;
   checkbox.onchange=()=>{if(checkbox.checked)selected.set(f.id,f);else selected.delete(f.id);renderSelected();$('pickerCount').textContent=`Đã chọn ${selected.size} tài liệu`};
   const text=document.createElement('span');text.textContent=f.name;label.append(checkbox,text);$('fileList').append(label);
  }
  $('pickerCount').textContent=`Đã chọn ${selected.size} tài liệu`;
 }
 function setBusy(value){busy=value;stopButton.hidden=!value&&!classifying;for(const id of ['scan','chooseFiles','import','useResources','ocrLimit','ocrStart','ocrEnd'])if($(id))$(id).disabled=value;renderSelected();renderFiles(files)}
 async function scan(){
  if(busy)return;
  if(!active())return message('Hãy kết nối Google để tìm slide trong tài khoản của bạn.');
  backgroundId++;classifying=false;controller?.abort();const run=epoch;controller=new AbortController();setBusy(true);status('Đang tìm tài liệu trong tài khoản Google…');
  try{
   const found=await listSlides(request);if(run!==epoch)return;files=found;
   suggestions=suggestedResources(files);selected.clear();
   status(suggestions.length?`Tìm thấy ${suggestions.length} tài liệu đúng mẫu tên. Chưa chọn tài liệu nào; tích chọn nguồn bạn muốn ôn luyện.`:'Không có slide tên SEMESTER, SEMETER hoặc Sever kèm số. Bấm Chọn tài liệu khác hoặc dán link slide của bạn.');
   renderSelected();renderFiles(files);
  }catch(error){if(run!==epoch||error.name==='AbortError')return;status('Chưa tìm được danh sách tài liệu.');message(error.message)}
  finally{if(run===epoch)setBusy(false)}
 }
 function connect({switchAccount=false}={}){
  if(hasActiveSession())return onAccountError('Hãy hoàn thành bài đang làm trước khi đổi kết nối Google.');
  if(busy)return;
  const clientId=resolveGoogleClientId();if(!clientId)return onAccountError('Kết nối Google hiện chưa sẵn sàng. Vui lòng thử lại sau.');
  if(!window.google?.accounts?.oauth2)return onAccountError('Chưa tải được cửa sổ đăng nhập Google. Kiểm tra mạng rồi thử lại.');
  const run=++epoch;
  google.accounts.oauth2.initTokenClient({client_id:clientId,scope:GOOGLE_SCOPES.join(' '),callback:async r=>{
   if(run!==epoch)return;
   if(r.error)return onAccountError('Chưa đăng nhập được Google. Hãy thử lại.');
   if(!google.accounts.oauth2.hasGrantedAllScopes(r,...GOOGLE_SCOPES))return onAccountError('Cần đồng ý chia sẻ thông tin tài khoản và quyền đọc tài liệu để kết nối Google.');
   reset();token=r.access_token;expires=Date.now()+r.expires_in*1000;
   const accountEpoch=epoch;profileController=new AbortController();
   updateProfile({name:'Tài khoản Google'});scheduleExpiry();
   try{
    const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${token}`},signal:profileController.signal});
    if(response.ok){const profile=await response.json();if(accountEpoch!==epoch)return;updateProfile({name:profile.name,email:profile.email,picture:profile.picture});}
   }catch(error){if(accountEpoch!==epoch||error.name==='AbortError')return;}
   if(accountEpoch!==epoch)return;
   message('');scan();
  },error_callback:()=>{if(run===epoch)onAccountError('Cửa sổ Google bị đóng hoặc chặn. Hãy kết nối lại.')}}).requestAccessToken({prompt:switchAccount?'select_account':''});
 };
 function disconnect(){const oldToken=token;reset();if(oldToken)google.accounts.oauth2.revoke(oldToken,()=>{});status('Đăng nhập ở góc phải để chọn tài liệu.');message('Đã đăng xuất Google. Dữ liệu đã nhập vẫn được giữ trên trình duyệt này.')}
 $('scan').onclick=scan;
 $('chooseFiles').onclick=()=>{if(!active())return message('Kết nối Google trước khi chọn tài liệu.');renderFiles(files);$('filePicker').showModal()};
 $('resourceSearch').oninput=()=>renderFiles(files);
 $('import').onclick=async()=>{
  if(busy)return;
  const id=presentationIdFromLink($('slideLink').value);if(!id)return message('Dán link Google Slides hợp lệ: https://docs.google.com/presentation/d/…');
  if(!active())return message('Hãy kết nối Google trước khi thêm tài liệu.');
  selected.set(id,files.find(f=>f.id===id)||{id,name:`Slide được chọn qua link (${id})`});renderSelected();
  status('Đã thêm link vào danh sách nguồn. Bấm Dùng tài liệu đã chọn để nhập câu hỏi.');
 };
 $('useResources').onclick=async()=>{
  if(busy||!selected.size)return;
  if(hasActiveSession())return message('Hoàn thành bài đang làm trước khi thay bộ tài liệu.');
  if(!active())return message('Hãy kết nối lại Google để nhập tài liệu.');
  const startSlide=Number($('ocrStart').value||1),endSlide=Number($('ocrEnd').value||Infinity);
  if(!Number.isInteger(startSlide)||startSlide<1||(Number.isFinite(endSlide)&&(!Number.isInteger(endSlide)||endSlide<startSlide)))return message('Khoảng slide không hợp lệ. Trang bắt đầu phải từ 1 và không lớn hơn trang kết thúc.');
  if(document.getElementById('total').textContent!=='0'&&!await (window.askConfirm ? window.askConfirm('Dùng các tài liệu đã chọn làm ngân hàng câu hỏi hiện tại? Ngân hàng trước sẽ được thay thế; lịch sử bài làm vẫn giữ.',{title:'Thay đổi ngân hàng',okText:'Thay thế'}) : confirm('Dùng các tài liệu đã chọn làm ngân hàng câu hỏi hiện tại? Ngân hàng trước sẽ được thay thế; lịch sử bài làm vẫn giữ.')))return;
  const maxQuestions=Number($('ocrLimit').value)||Infinity;
  backgroundId++;classifying=false;controller?.abort();const run=epoch;controller=new AbortController();setBusy(true);finishEarly=false;progressPanel.hidden=false;stopButton.textContent='Dừng nhập';
  $('useReady').hidden=true;$('useReady').disabled=false;$('ocrBar').value=0;$('ocrPercent').textContent='0%';
  const signal=controller.signal,started=Date.now();let foundBefore=0;
  const inspect=AI_API_BASE&&document.getElementById('sourceAutoAI')?.checked?async q=>{
   const blob=await slideBlob(q,{signal});if(signal.aborted)throw new DOMException('Stopped','AbortError');
   if(blob.size>2100000)throw Error('Slide image exceeds 2 MB');
   const response=await solveBatch(AI_API_BASE,[{...q,image:{mimeType:blob.type,data:await blobToBase64(blob)}}],apiToken(),{signal});return {result:response.answers[0],model:response.model};
  }:null;
  try{
   const result=await readSelectedResources([...selected.values()],request,async(p,resource)=>{
    rememberPresentation(p);
    return selectQuestionSlides(p,{startSlide,endSlide,maxQuestions,signal,inspect,deferInspection:true,shouldStop:()=>finishEarly,
     onProgress:progress=>{
      $('ocrBar').value=progress.slide/progress.totalSlides*100;$('ocrPercent').textContent=Math.round(progress.slide/progress.totalSlides*100)+'%';
      $('ocrHeadline').textContent=p.title+' - slide '+progress.slide+'/'+progress.totalSlides;
      $('ocrCount').textContent=`${progress.found} câu · bỏ ${progress.skipped} trang khác · ${progress.unresolved} trang chưa xác định`;
     }
    });
   },(i,n,name)=>status(`Đang đọc ${i}/${n}: ${name}`),()=>finishEarly);
   if(run!==epoch)return;
   $('ocrBar').value=100;$('ocrPercent').textContent='100%';$('ocrHeadline').textContent='Đã hoàn tất lọc slide câu hỏi';$('ocrTime').textContent=`Hoàn tất trong ${Math.round((Date.now()-started)/1000)} giây`;
   showDiagnostics(result.diagnostics);
   if(!result.questions.length&&!result.deferred?.length){status('Chưa thay đổi ngân hàng câu hỏi.');return message('Chưa tìm thấy slide đủ điều kiện câu hỏi – lựa chọn. Trang quảng cáo, hướng dẫn và ảnh chưa xác định không được nhập. '+result.failures.map(f=>`${f.name}: ${f.error}`).join('\n'))}
   if(result.failures.length&&!await (window.askConfirm ? window.askConfirm(`Có ${result.failures.length} tài liệu chưa đọc được:\n${result.failures.map(f=>`${f.name}: ${f.error}`).join('\n')}\n\nTiếp tục dùng ${result.sources.length} tài liệu đã đọc được?`,{title:'Tài liệu chưa đọc được',danger:true,okText:'Tiếp tục'}) : confirm(`Có ${result.failures.length} tài liệu chưa đọc được:\n${result.failures.map(f=>`${f.name}: ${f.error}`).join('\n')}\n\nTiếp tục dùng ${result.sources.length} tài liệu đã đọc được?`))){status('Đã giữ ngân hàng trước.');return}
   if(!onImport(result))return;
   const remaining=result.sources.reduce((n,s)=>n+s.remaining,0);
   status(`Đã sẵn sàng: ${result.questions.length} câu từ ${result.sources.length} tài liệu.${remaining?` Còn ${remaining} trang chưa đọc; tăng số câu hoặc chọn Đọc toàn bộ để nhập thêm.`:''}`);
   const excluded=result.diagnostics.reduce((n,d)=>n+(d.excluded||0),0),unknown=result.diagnostics.reduce((n,d)=>n+(d.unresolved||0),0);
   message(`Sẵn sàng ${result.questions.length} câu để ôn ngay, giữ nguyên ảnh và số slide gốc. Đã bỏ ${excluded} trang không phải câu hỏi.${result.deferred?.length?` Đang kiểm tra thêm ${result.deferred.length} ảnh ở nền; không cần chờ để bắt đầu ôn.`:unknown?` ${unknown} ảnh chưa xác định chưa được nhập; có thể bật AI và thử lại.`:''}`);
   if(result.deferred?.length&&inspect){const job=++backgroundId;setTimeout(async()=>{
    if(job!==backgroundId||run!==epoch||signal.aborted)return;classifying=true;stopButton.hidden=false;stopButton.textContent='Dừng kiểm tra thêm';let added=0,checked=0,other=0,total=result.questions.length;
    try{for(const q of result.deferred){
     if(job!==backgroundId||run!==epoch||signal.aborted||!document.getElementById('sourceAutoAI')?.checked)break;
     $('ocrHeadline').textContent=`Đã nhập câu hỏi · kiểm tra thêm ${checked+1}/${result.deferred.length} ảnh`;$('ocrDetail').textContent='Bạn có thể ôn ngay các câu đã nhập. Chỉ bổ sung ảnh được xác định là câu hỏi.';
     try{const output=await inspect(q);if(job!==backgroundId||run!==epoch||signal.aborted||!document.getElementById('sourceAutoAI')?.checked)break;const question=inspectedQuestion(q,output);if(output.result.kind==='other')other++;if(question){const update=onDeferredQuestion(question,{limit:maxQuestions});if(update===false)break;added++;total=typeof update?.count==='number'?update.count:total+1}}
     catch(error){if(error.name==='AbortError'||error.code!=='AI_IMAGE_INVALID')break}
     checked++;$('ocrCount').textContent=`${total} câu đã nhập · đã kiểm tra thêm ${checked}/${result.deferred.length} ảnh`;
    }}finally{if(job===backgroundId&&run===epoch){classifying=false;stopButton.hidden=true;$('ocrHeadline').textContent=`Sẵn sàng ${total} câu để ôn`;$('ocrDetail').textContent=`Đã kiểm tra thêm ${checked}/${result.deferred.length} ảnh. Các ảnh chưa xác định không được đưa vào đề.`;status(`Đã sẵn sàng ${total} câu. Có thể bắt đầu ôn luyện.`);const remainingUnknown=Math.max(0,unknown-added-other);message(`Sẵn sàng ${total} câu để ôn ngay, giữ nguyên ảnh và số slide gốc. Đã bỏ ${excluded+other} trang không phải câu hỏi.${remainingUnknown?` ${remainingUnknown} ảnh chưa xác định chưa được nhập.`:''}`)}}
   },0)}
  }catch(error){if(run===epoch&&error.name!=='AbortError')message(error.message)}
  finally{if(run===epoch){setBusy(false);$('useReady').hidden=true}}
 };
 async function readAnswers(questions){
  if(!active())throw Error('Đăng nhập Google ở ảnh đại diện để đọc ghi chú từ slide.');
  if(busy)throw Error('Hãy đợi nhập tài liệu xong rồi lấy đáp án.');
  const updates=[],failures=[],unresolved={missingSlide:[],empty:[],unmatched:[]},run=epoch;
  const needsNotes=q=>!q.verified||!q.explanation;
  const ids=[...new Set(questions.filter(needsNotes).map(q=>q.sourceId||presentationIdFromLink(q.url)).filter(Boolean))];
  for(const id of ids){
   try{
    const p=await request(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(id)}`);
    if(run!==epoch)throw Error('Tài khoản đã thay đổi. Hãy thử lại.');
    if(p.presentationId!==id)throw Error('Nguồn trả về không khớp.');
    for(const q of questions.filter(q=>needsNotes(q)&&(q.sourceId||presentationIdFromLink(q.url))===id)){
     const objectId=q.url?.match(/#slide=id\.(.+)$/)?.[1];
     const slide=p.slides?.find(s=>s.objectId===objectId);
     if(!slide){unresolved.missingSlide.push(q.slide);continue;}
     const {answer,explanation}=detailsFromNotes(slide,q.options);
     if(answer){
      if(!q.verified||q.answer===answer&&explanation&&!q.explanation)updates.push({id:q.id,answer,explanation});
      else if(q.answer!==answer)unresolved.unmatched.push(q.slide);
     }else if(!q.verified)unresolved[speakerNotesText(slide)?'unmatched':'empty'].push(q.slide);
    }
   }catch(error){if(run!==epoch)throw error;failures.push(error.message)}
  }
  if(run!==epoch)throw Error('Tài khoản đã thay đổi. Hãy thử lại.');
  return {updates,failures,unresolved};
 }
 try{
  const saved=JSON.parse(sessionStorage.getItem(sessionKey)||'null');
  if(saved&&saved.clientId===resolveGoogleClientId()&&typeof saved.token==='string'&&Number.isFinite(saved.expires)&&saved.expires>Date.now()){
   token=saved.token;expires=saved.expires;updateProfile(saved.profile||{name:'Tài khoản Google'});scheduleExpiry();
   setTimeout(()=>{if(active())scan()},0);
  }else sessionStorage.removeItem(sessionKey);
 }catch{try{sessionStorage.removeItem(sessionKey)}catch{}}
 function apiToken(){if(!active())throw Error('Kết nối Google ở ảnh đại diện để sử dụng AI. Câu đã lưu vẫn ôn được mà không cần đăng nhập.');return token}
 async function slideImage(q,options={}){
  apiToken();
  const source=presentationIdFromLink(q.url),url=new URL(q.url),objectId=new URLSearchParams(url.hash.slice(1)).get('slide')?.replace(/^id\./,'');
  if(!source||q.sourceId&&q.sourceId!==source||!objectId||! /^[\w.-]+$/.test(objectId))throw Error('Không xác định được slide gốc của câu này.');
  const cached=thumbnailCache.get(q.url);if(!options.forceThumbnail&&cached&&Date.now()-cached.created<5*60000)return abortableResult(cached.promise,options.signal);
  const run=epoch;
  if(!options.forceThumbnail){
   let snapshot=presentations.get(source);if(!snapshot||Date.now()-snapshot.created>=5*60000){snapshot={created:Date.now(),promise:request(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(source)}`,options)};presentations.set(source,snapshot);snapshot.promise.catch(()=>{if(presentations.get(source)===snapshot)presentations.delete(source)})}
   try{const p=await abortableResult(snapshot.promise,options.signal);if(run!==epoch||!active())throw Error('Tài khoản Google đã thay đổi.');const direct=directSlideImage(p.slides?.find(slide=>slide.objectId===objectId));if(direct){thumbnailCache.set(q.url,{created:Date.now(),promise:Promise.resolve(direct)});return direct}}catch(error){if(error.name==='AbortError'||run!==epoch)throw error}
  }
  const promise=request(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(source)}/pages/${encodeURIComponent(objectId)}/thumbnail?thumbnailProperties.thumbnailSize=LARGE`,options).then(thumbnail=>{if(run!==epoch||!active())throw Error('Tài khoản Google đã thay đổi.');const imageUrl=new URL(thumbnail.contentUrl);if(imageUrl.protocol!=='https:')throw Error('Google chưa trả ảnh slide hợp lệ.');return thumbnail.contentUrl}).catch(error=>{thumbnailCache.delete(q.url);throw error});
  thumbnailCache.set(q.url,{created:Date.now(),promise});return abortableResult(promise,options.signal);
 }
 function slideBlob(q,options={}){apiToken();return abortableResult(slideBytes.get(q,options),options.signal)}
 async function loadSlideBlob(q,options={}){
  const url=await slideImage(q,options);
  let response;try{response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:options.signal})}catch(error){if(error.name==='AbortError')throw error}
  if(!response||[401,403,404].includes(response.status)){thumbnailCache.delete(q.url);response=await fetch(await slideImage(q,{...options,forceThumbnail:true}),{credentials:'omit',referrerPolicy:'no-referrer',signal:options.signal})}
  if(!response.ok)throw Error('Chưa tải được ảnh gốc.');
  const blob=await response.blob();if(!blob.type.startsWith('image/'))throw Error('Google chưa trả nội dung ảnh hợp lệ.');
  if(!['image/png','image/jpeg','image/webp'].includes(blob.type)&&!options.forceThumbnail)return loadSlideBlob(q,{...options,forceThumbnail:true});
  if(options.maxBytes&&blob.size>options.maxBytes&&!options.forceThumbnail)return loadSlideBlob(q,{...options,forceThumbnail:true});
  return blob;
 }
 return {connect,disconnect,readAnswers,apiToken,slideImage,slideBlob,isBusy:()=>busy||classifying};
}
