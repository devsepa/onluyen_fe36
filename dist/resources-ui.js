import {GOOGLE_SCOPES,listSlides,suggestedResources,presentationIdFromLink,readSelectedResources} from './resources.mjs';
import {parseWithOcr} from './ocr.mjs?v=20261113-notes-18';
import {createBrowserPool,createOcrCache} from './ocr-browser.js';
import {resolveGoogleClientId} from './site-config.mjs';
import {detailsFromNotes,speakerNotesText} from './core.mjs?v=20261113-notes-18';

const $=id=>document.getElementById(id);
export function setupResources({message,onImport,hasActiveSession,onAccountChange=()=>{},onAccountError=message}){
 let token=null,expires=0,files=[],suggestions=[],selected=new Map(),controller=null,busy=false,epoch=0;
 let expiryTimer,profileController;
 let accountProfile=null;
 const sessionKey='sot-google-session';
 function saveConnection(){try{if(token&&expires>Date.now())sessionStorage.setItem(sessionKey,JSON.stringify({token,expires,profile:accountProfile,clientId:resolveGoogleClientId()}));else sessionStorage.removeItem(sessionKey)}catch{}}
 function updateProfile(profile){accountProfile=profile;saveConnection();onAccountChange(profile)}
 function expireConnection(){token=null;expires=0;updateProfile(null)}
 function scheduleExpiry(){clearTimeout(expiryTimer);expiryTimer=setTimeout(expireConnection,Math.max(0,expires-Date.now()))}
 function status(text){$('resourceStatus').textContent=text}
 const diagnosticsPanel=document.createElement('details');
 diagnosticsPanel.id='importDiagnostics';diagnosticsPanel.hidden=true;$('resourceStatus').after(diagnosticsPanel);
 const stopButton=document.createElement('button');stopButton.className='secondary';stopButton.type='button';stopButton.textContent='Dừng nhập';stopButton.hidden=true;$('resourceStatus').after(stopButton);
 stopButton.onclick=()=>{controller?.abort();status('Đã dừng nhập. Các trang đã OCR được lưu để thử lại; ngân hàng trước vẫn được giữ.')};
 const ocrCache=createOcrCache();
 const progressPanel=document.createElement('section');progressPanel.className='import-progress';progressPanel.hidden=true;
 progressPanel.innerHTML='<div class="progress-heading"><strong id="ocrHeadline">Đang chuẩn bị tài liệu</strong><span id="ocrPercent">0%</span></div><progress id="ocrBar" max="100" value="0"></progress><div class="progress-metrics"><span id="ocrCount">0 câu đã nhận diện</span><span id="ocrTime">Đang ước tính…</span></div><p id="ocrDetail">Bạn có thể tiếp tục xem những trang khác trong ứng dụng.</p><button id="useReady" type="button" hidden>Dùng các câu đã đọc</button>';
 $('resourceStatus').after(progressPanel);progressPanel.append(stopButton);
 let finishEarly=false;
 $('useReady').onclick=()=>{finishEarly=true;$('useReady').disabled=true;$('useReady').textContent='Đang hoàn tất các trang đang đọc…'};
 function showDiagnostics(reports=[]){
  diagnosticsPanel.replaceChildren();diagnosticsPanel.hidden=!reports.length;
  const heading=document.createElement('summary');heading.textContent='Chi tiết nhập tài liệu';diagnosticsPanel.append(heading);
  for(const report of reports){
   const title=document.createElement('p');title.textContent=`${report.name}: ${report.totalSlides} slide, ${report.textSlides} slide có chữ, ${report.imageSlides} slide có ảnh.`;diagnosticsPanel.append(title);
   if(report.ocrAttempted){const help=document.createElement('p');help.textContent=`Đã đọc chữ từ ${report.ocrAttempted} trang ảnh, dùng lại ${report.ocrCached} trang đã lưu. ${report.ocrErrors} trang gặp lỗi.`;diagnosticsPanel.append(help)}
   for(const page of (report.pages||[]).filter(p=>p.ocrError).slice(0,5)){const error=document.createElement('p');error.textContent=`Slide ${page.slide}: ${page.ocrError}`;diagnosticsPanel.append(error)}
   const unresolved=(report.pages||[]).filter(p=>p.processed&&!p.recognized);
   if(unresolved.length){
   const help=document.createElement('p');help.textContent='Các slide chưa đọc được câu hỏi cần được kiểm tra lại. Mỗi câu tương ứng đúng một slide gốc. Có thể chọn khoảng slide bên dưới để đọc lại.';diagnosticsPanel.append(help);
    for(const page of unresolved){
     const row=document.createElement('p'),link=document.createElement('a');link.textContent=`Slide ${page.slide}`;link.href=`https://docs.google.com/presentation/d/${encodeURIComponent(report.id)}/edit#slide=id.${encodeURIComponent(page.objectId)}`;link.target='_blank';link.rel='noopener noreferrer';
     row.append(link,document.createTextNode(page.ocrError?' — Lỗi đọc trang':page.ocr?' — Chưa nhận diện câu hỏi từ ảnh':' — Chưa nhận diện câu hỏi từ chữ'));diagnosticsPanel.append(row);
    }
   }
   for(const page of unresolved.filter(p=>p.preview).slice(0,3)){
    const label=document.createElement('p');label.textContent=`Chữ nhận được từ slide ${page.slide}:`;
    const preview=document.createElement('pre');preview.style.whiteSpace='pre-wrap';preview.textContent=page.preview;diagnosticsPanel.append(label,preview);
   }
  }
 }
 function active(){return token&&Date.now()<expires}
 function reset(){clearTimeout(expiryTimer);profileController?.abort();expireConnection();stopButton.hidden=true;progressPanel.hidden=true;diagnosticsPanel.hidden=true;for(const id of ['ocrLanguage','ocrLimit','ocrStart','ocrEnd'])$(id).disabled=false;epoch++;controller?.abort();controller=null;files=[];suggestions=[];selected.clear();busy=false;renderSelected();renderFiles([]);$('scan').disabled=false;$('chooseFiles').disabled=false;$('import').disabled=false;$('useResources').disabled=false;if($('filePicker').open)$('filePicker').close()}
 let nextThumbnailAt=0;
 function delay(ms,signal){return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new DOMException('Đã dừng.','AbortError'));
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Đã dừng.','AbortError'))};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms);signal?.addEventListener('abort',abort,{once:true});
 })}
 async function request(url){
  const signal=controller?.signal.aborted?undefined:controller?.signal;
  if(url.includes('/thumbnail?')){const reserved=Math.max(Date.now(),nextThumbnailAt);nextThumbnailAt=reserved+1100;await delay(Math.max(0,reserved-Date.now()),signal);}
  for(let attempt=0;attempt<5;attempt++){
  if(!active())throw Object.assign(Error('Phiên Google đã hết hạn. Bấm Kết nối Google để tiếp tục.'),{ocrFatal:true});
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal});
  if((r.status===429||r.status>=500)&&attempt<4){await delay(Math.max(Number(r.headers.get('Retry-After')||0)*1000,2**attempt*1000+Math.random()*500),signal);continue;}
  if(!r.ok){
   if(r.status===401){expireConnection();throw Object.assign(Error('Quyền đọc Google đã hết hạn. Kết nối lại ở ảnh đại diện khi cần đọc slide; câu đã lưu vẫn ôn bình thường.'),{ocrFatal:true});}
   if(r.status===403||r.status===404)throw Error('Chưa truy cập được tài liệu. Hãy dùng đúng tài khoản Google có quyền xem tài liệu rồi thử lại.');
   throw Error(`Google trả lỗi ${r.status}. Hãy thử lại.`);
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
 function setBusy(value){busy=value;stopButton.hidden=!value;for(const id of ['scan','chooseFiles','import','useResources','ocrLanguage','ocrLimit','ocrStart','ocrEnd'])if($(id))$(id).disabled=value;renderSelected();renderFiles(files)}
 async function scan(){
  if(busy)return;
  if(!active())return message('Hãy kết nối Google để tìm slide trong tài khoản của bạn.');
  const run=epoch;controller=new AbortController();setBusy(true);status('Đang tìm tài liệu trong tài khoản Google…');
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
  // Ask about replacement only when an existing bank would actually be replaced.
  if(document.getElementById('total').textContent!=='0'&&!confirm('Dùng các tài liệu đã chọn làm ngân hàng câu hỏi hiện tại? Ngân hàng trước sẽ được thay thế; lịch sử bài làm vẫn giữ.'))return;
  const maxQuestions=Number($('ocrLimit').value)||Infinity,language=$('ocrLanguage').value;
  const concurrency=(navigator.hardwareConcurrency||4)>=4&&(navigator.deviceMemory||4)>=4?2:1;
  const run=epoch;controller=new AbortController();setBusy(true);finishEarly=false;progressPanel.hidden=false;
  $('useReady').hidden=true;$('useReady').disabled=false;$('ocrBar').value=0;$('ocrPercent').textContent='0%';
  const signal=controller.signal,started=Date.now();let foundBefore=0;
  const recognizer=createBrowserPool({size:concurrency,language,onStatus:detail=>{if(run===epoch&&!signal.aborted)$('ocrDetail').textContent=detail}});
  try{
   const result=await readSelectedResources([...selected.values()],request,async(p,resource)=>{
    // Refresh the source version: the user may have edited it since the initial file listing.
    let currentResource={...resource,modifiedTime:undefined};
    try{const metadata=await request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(resource.id)}?fields=modifiedTime&supportsAllDrives=true`);currentResource.modifiedTime=metadata.modifiedTime}catch(error){if(signal.aborted)throw error;}
    const parsed=await parseWithOcr(p,currentResource,{request,recognize:(url,s)=>recognizer.recognize(url,s),cache:ocrCache,signal,concurrency,maxQuestions,startSlide,endSlide,shouldStop:()=>finishEarly,onProgress:progress=>{
     if(run!==epoch||signal.aborted)return;
     const found=foundBefore+progress.found,percent=progress.done?100:(progress.total?Math.round(progress.completed/progress.total*100):0);
     status(p.title);$('ocrHeadline').textContent=progress.done?'Đã hoàn tất lượt đọc':`Đang đọc slide ${progress.slide} / ${progress.totalSlides}`;
     $('ocrBar').value=percent;$('ocrPercent').textContent=`${percent}%`;$('ocrCount').textContent=`${found} câu đã nhận diện · ${progress.cached} trang dùng lại`;
     const elapsed=(Date.now()-started)/1000;
     $('ocrTime').textContent=progress.completed>2?`${Math.floor(elapsed/60)} phút ${Math.round(elapsed%60)} giây đã xử lý`:'Đang chuẩn bị lần đầu…';
     $('useReady').hidden=!found||finishEarly;if(!finishEarly)$('useReady').textContent=`Dùng ngay ${found} câu đã đọc →`;
    }});
    foundBefore+=parsed.questions.length;return parsed;
   },(i,n,name)=>status(`Đang đọc ${i}/${n}: ${name}`),()=>finishEarly);
   if(run!==epoch)return;
   showDiagnostics(result.diagnostics);
   if(!result.questions.length){status('Chưa thay đổi ngân hàng câu hỏi.');return message(result.failures.map(f=>`${f.name}: ${f.error}`).join('\n'))}
   if(result.failures.length&&!confirm(`Có ${result.failures.length} tài liệu chưa đọc được:\n${result.failures.map(f=>`${f.name}: ${f.error}`).join('\n')}\n\nTiếp tục dùng ${result.sources.length} tài liệu đã đọc được?`)){status('Đã giữ ngân hàng trước.');return}
   if(!onImport(result))return;
   const remaining=result.sources.reduce((n,s)=>n+s.remaining,0);
   status(`Đã sẵn sàng: ${result.questions.length} câu từ ${result.sources.length} tài liệu.${remaining?` Còn ${remaining} trang chưa đọc; tăng số câu hoặc chọn Đọc toàn bộ để nhập thêm.`:''}`);
   const skipped=result.sources.filter(s=>s.skipped.length).map(s=>`${s.name}: đã đọc nhưng chưa nhận diện câu hỏi ở slide ${s.skipped.join(', ')}. Xem Chi tiết nhập tài liệu để kiểm tra.`);
   message(`Đã nhập ${result.questions.length} câu từ ${result.sources.length} tài liệu theo thứ tự slide gốc. Đáp án rõ ràng trong ghi chú được dùng ngay.${skipped.length?'\n'+skipped.join('\n'):''}`);
  }catch(error){if(run===epoch&&error.name!=='AbortError')message(error.message)}
  finally{await recognizer.terminate();if(run===epoch){setBusy(false);$('useReady').hidden=true}}
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
 async function slideImage(q){
  apiToken();
  const source=presentationIdFromLink(q.url),url=new URL(q.url),objectId=new URLSearchParams(url.hash.slice(1)).get('slide')?.replace(/^id\./,'');
  if(!source||q.sourceId&&q.sourceId!==source||!objectId||! /^[\w.-]+$/.test(objectId))throw Error('Không xác định được slide gốc của câu này.');
  const thumbnail=await request(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(source)}/pages/${encodeURIComponent(objectId)}/thumbnail?thumbnailProperties.thumbnailSize=LARGE`);
  const imageUrl=new URL(thumbnail.contentUrl);
  if(imageUrl.protocol!=='https:')throw Error('Google chưa trả ảnh slide hợp lệ.');
  const response=await fetch(imageUrl,{credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('Chưa tải được ảnh gốc. Hãy mở slide để đối chiếu.');
  const blob=await response.blob();if(!blob.type.startsWith('image/'))throw Error('Google chưa trả nội dung ảnh hợp lệ.');
  return URL.createObjectURL(blob);
 }
 return {connect,disconnect,readAnswers,apiToken,slideImage};
}
