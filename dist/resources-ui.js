import {GOOGLE_SCOPES,listSlides,suggestedResources,presentationIdFromLink,readSelectedResources} from './resources.mjs';
import {parseWithOcr} from './ocr.mjs';
import {createBrowserPool,createOcrCache} from './ocr-browser.js';
import {resolveGoogleClientId} from './site-config.mjs';

const $=id=>document.getElementById(id);
export function setupResources({message,onImport,hasActiveSession,onAccountChange=()=>{},onAccountError=message}){
 let token=null,expires=0,files=[],suggestions=[],selected=new Map(),controller=null,busy=false,epoch=0;
 let expiryTimer,profileController;
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
   for(const page of (report.pages||[]).filter(p=>!p.recognized&&p.textLength>0).slice(0,3)){
    const label=document.createElement('p');label.textContent=`Chữ nhận được từ slide ${page.slide}:`;
    const preview=document.createElement('pre');preview.style.whiteSpace='pre-wrap';preview.textContent=page.preview;diagnosticsPanel.append(label,preview);
   }
  }
 }
 function active(){return token&&Date.now()<expires}
 function reset(){clearTimeout(expiryTimer);profileController?.abort();onAccountChange(null);stopButton.hidden=true;progressPanel.hidden=true;diagnosticsPanel.hidden=true;for(const id of ['ocrLanguage','ocrLimit','ocrStart','ocrEnd'])$(id).disabled=false;epoch++;controller?.abort();controller=null;token=null;expires=0;files=[];suggestions=[];selected.clear();busy=false;renderSelected();renderFiles([]);$('scan').disabled=false;$('chooseFiles').disabled=false;$('import').disabled=false;$('useResources').disabled=false;if($('filePicker').open)$('filePicker').close()}
 let nextThumbnailAt=0;
 function delay(ms,signal){return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new DOMException('Đã dừng.','AbortError'));
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Đã dừng.','AbortError'))};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve()},ms);signal?.addEventListener('abort',abort,{once:true});
 })}
 async function request(url){
  const signal=controller?.signal;
  if(url.includes('/thumbnail?')){const reserved=Math.max(Date.now(),nextThumbnailAt);nextThumbnailAt=reserved+1100;await delay(Math.max(0,reserved-Date.now()),signal);}
  for(let attempt=0;attempt<5;attempt++){
  if(!active())throw Object.assign(Error('Phiên Google đã hết hạn. Bấm Kết nối Google để tiếp tục.'),{ocrFatal:true});
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal});
  if((r.status===429||r.status>=500)&&attempt<4){await delay(Math.max(Number(r.headers.get('Retry-After')||0)*1000,2**attempt*1000+Math.random()*500),signal);continue;}
  if(!r.ok){
   if(r.status===401){token=null;expires=0;onAccountChange(null);throw Object.assign(Error('Phiên Google đã hết hạn. Hãy kết nối lại.'),{ocrFatal:true});}
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
 function connect(){
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
    onAccountChange({name:'Tài khoản Google'});
    expiryTimer=setTimeout(()=>{if(accountEpoch===epoch){token=null;expires=0;onAccountChange(null);}},Math.max(0,expires-Date.now()));
    try{
     const response=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${token}`},signal:profileController.signal});
     if(response.ok){const profile=await response.json();if(accountEpoch!==epoch)return;onAccountChange({name:profile.name,email:profile.email,picture:profile.picture});}
    }catch(error){if(accountEpoch!==epoch||error.name==='AbortError')return;}
    if(accountEpoch!==epoch)return;
   message('');scan();
  },error_callback:()=>{if(run===epoch)onAccountError('Cửa sổ Google bị đóng hoặc chặn. Hãy kết nối lại.')}}).requestAccessToken({prompt:'select_account'});
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
   const skipped=result.sources.filter(s=>s.skipped.length).map(s=>`${s.name}: bỏ qua slide ${s.skipped.join(', ')}`);
   message(`Đã nhập ${result.questions.length} câu từ ${result.sources.length} tài liệu. Chỉ các nguồn này được dùng tạo đề. Kiểm tra và xác nhận đáp án trước khi luyện.${skipped.length?'\n'+skipped.join('\n'):''}`);
  }catch(error){if(run===epoch&&error.name!=='AbortError')message(error.message)}
  finally{await recognizer.terminate();if(run===epoch){setBusy(false);$('useReady').hidden=true}}
 };
 return {connect,disconnect};
}
