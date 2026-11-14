import { presentationIdFromLink } from './resources.mjs?v=2026.11.14.32';
import { readyForPractice } from './ai.mjs?v=2026.11.14.32';
import { askConfirm } from './confirm-dialog.mjs?v=2026.11.14.32';

function esc(value){return String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function blobToBase64(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(blob)})}
export function sharedImagePath(q){if(!/^[a-f0-9-]{36}$/.test(q.sharedDeck)||!Number.isInteger(q.sharedIndex)||q.sharedIndex<0)throw Error('Ảnh trong kho không hợp lệ.');return `/v1/decks/${q.sharedDeck}/images/${q.sharedIndex}`}
export async function deckRequest(base,path,{method='GET',token,uploadToken,body,signal,fetcher=fetch}={}){
 if(!base)throw Error('Kho đề đang được chuẩn bị.');const root=new URL(base);if(root.protocol!=='https:'&&!(root.protocol==='http:'&&['localhost','127.0.0.1'].includes(root.hostname)))throw Error('Kho đề chưa sẵn sàng.');
 const headers={};if(uploadToken)headers.Authorization='Upload '+uploadToken;else if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']='application/json';
 const response=await fetcher(new URL(path,root),{method,headers,...(body?{body:JSON.stringify(body)}:{}),signal});
 if(!response.ok){let message=response.statusText;try{const data=await response.json();message=data.error||message}catch{}const error=new Error(message);error.status=response.status;throw error}
 return response;
}
export function setupSharedDecks({base,getBank,getToken,getBlob,canChange,onUse,onUseLocal}){
 const $=id=>document.getElementById(id),section=$('shared'),dialog=document.createElement('dialog'),publishButton=document.createElement('button');publishButton.id='publishDeck';publishButton.className='secondary';publishButton.textContent='↑ Đăng vào kho chung';$('library').querySelector('.section-heading .row').prepend(publishButton);dialog.className='publish-dialog';dialog.setAttribute('aria-labelledby','publishTitle');
 dialog.innerHTML='<form id="publishForm"><div class="modal-heading"><h2 id="publishTitle">Đăng bộ đề vào kho chung</h2><button type="button" class="secondary" id="closePublish">Đóng</button></div><label>Tên bộ đề<input id="deckTitle" required maxlength="160" placeholder="Ví dụ: DBI202 · Học kỳ 3"></label><p id="publishCount"></p><p>Ảnh slide, đáp án và giải thích sẽ công khai cho mọi người. Link Google riêng vẫn giữ quyền truy cập của Google. Lịch sử và thông tin tài khoản không được chia sẻ.</p><label class="check-label"><input id="publishRights" type="checkbox" required> Tôi có quyền chia sẻ các ảnh slide và nội dung này.</label><p id="publishStatus" role="status" aria-live="polite"></p><progress id="publishBar" value="0" max="1" hidden></progress><div class="modal-actions"><button type="submit" id="publishSubmit">Đăng bộ đề</button><button type="button" id="stopPublish" class="secondary" hidden>Dừng tải lên</button></div></form>';
 dialog.querySelector('p:not([id])').textContent='Ảnh slide, đáp án và giải thích sẽ công khai; tài khoản và lịch sử vẫn riêng. Link Google giữ nguyên quyền xem. Có thể đóng hộp thoại để ôn tiếp, nhưng cần giữ tab này mở đến khi tải xong.';
 document.body.append(dialog);let controller=null,items=[],loading=false;

 const widget=document.createElement('aside');widget.className='upload-progress-widget';widget.hidden=true;
 widget.innerHTML='<div class="upload-widget-header"><div class="upload-widget-title-group"><span class="upload-widget-icon" id="uploadWidgetIcon">☁️</span><div class="upload-widget-info"><strong class="upload-widget-title">Đăng vào kho chung</strong><span class="upload-widget-deck-name" id="uploadDeckName"></span></div></div><div class="upload-widget-controls"><button type="button" class="upload-widget-btn-icon" id="uploadWidgetToggle" title="Thu nhỏ / Mở rộng">−</button><button type="button" class="upload-widget-btn-icon" id="uploadWidgetClose" title="Ẩn">✕</button></div></div><div class="upload-widget-body"><div class="upload-widget-progress-row"><span class="upload-widget-metric" id="uploadWidgetMetric">0 / 0</span><span class="upload-widget-percent" id="uploadWidgetPercent">0%</span></div><div class="upload-progress-track"><div class="upload-progress-bar" id="uploadProgressBar" style="width:0%"></div></div><p class="upload-widget-status" id="uploadWidgetStatus" role="status" aria-live="polite">Đang chuẩn bị…</p><div class="upload-widget-actions"><button type="button" class="secondary upload-widget-action-btn" id="uploadWidgetStop" hidden>Dừng</button><button type="button" class="upload-widget-action-btn" id="uploadWidgetResume" hidden>Tiếp tục tải</button><button type="button" class="text-button upload-widget-action-btn" id="uploadWidgetDetails">Chi tiết</button></div></div>';
 document.body.append(widget);

 const draftKey='sot-deck-draft',readDraft=()=>{try{return JSON.parse(localStorage.getItem(draftKey)||'null')}catch{return null}},saveDraft=draft=>{try{draft?localStorage.setItem(draftKey,JSON.stringify(draft)):localStorage.removeItem(draftKey)}catch{}};
 const owned=()=>{try{return JSON.parse(localStorage.getItem('sot-published-decks')||'[]')}catch{return []}};

 function updateProgress({status,current,total,isRunning,error,success}={}){
  widget.hidden=false;
  const name=$('deckTitle')?.value.trim()||readDraft()?.title||'Bộ đề';
  $('uploadDeckName').textContent=name;
  if(status!==undefined){$('publishStatus').textContent=status;$('uploadWidgetStatus').textContent=status}
  if(total!==undefined&&total>0){
   const cur=current||0,pct=Math.min(100,Math.round((cur/total)*100));
   $('uploadWidgetMetric').textContent=`${cur} / ${total} ảnh`;
   $('uploadWidgetPercent').textContent=`${pct}%`;
   $('uploadProgressBar').style.width=`${pct}%`;
   $('publishBar').value=cur;$('publishBar').max=total;
  }
  if(isRunning){
   widget.classList.remove('has-error','is-success');$('uploadWidgetIcon').textContent='⏳';$('uploadWidgetStop').hidden=false;$('uploadWidgetResume').hidden=true;
  }else{
   $('uploadWidgetStop').hidden=true;
   if(error){
    widget.classList.add('has-error');widget.classList.remove('is-success');$('uploadWidgetIcon').textContent='⚠️';
    if(readDraft())$('uploadWidgetResume').hidden=false;
   }else if(success){
    widget.classList.add('is-success');widget.classList.remove('has-error');$('uploadWidgetIcon').textContent='✓';$('uploadWidgetResume').hidden=true;
   }else{
    widget.classList.remove('has-error','is-success');$('uploadWidgetIcon').textContent='☁️';
    if(readDraft())$('uploadWidgetResume').hidden=false;
   }
  }
 }
 const setStatus=text=>updateProgress({status:text});

 $('uploadWidgetClose').onclick=()=>{widget.hidden=true};
 $('uploadWidgetToggle').onclick=()=>{
  const collapsed=widget.classList.toggle('collapsed');
  $('uploadWidgetToggle').textContent=collapsed?'+':'−';
 };
 $('uploadWidgetDetails').onclick=()=>{if(!dialog.open)dialog.showModal()};
 $('uploadWidgetStop').onclick=()=>controller?.abort();
 $('uploadWidgetResume').onclick=()=>{
  if(!controller){
   if(!dialog.open)dialog.showModal();
   $('publishSubmit').click();
  }
 };

 $('closePublish').onclick=()=>dialog.close();$('stopPublish').onclick=()=>controller?.abort();
 $('publishDeck').onclick=()=>{
  if(controller){updateProgress({isRunning:true});return}
  if(!canChange())return;
  const ready=getBank().filter(readyForPractice);
  $('publishCount').textContent=`Đăng ${ready.length} câu có đáp án / ${getBank().length} câu. Câu thiếu đáp án không được đăng.`;
  $('publishStatus').textContent='';$('publishBar').hidden=true;$('publishRights').checked=false;
  $('publishSubmit').disabled=!ready.length||ready.length>500;
  $('deckTitle').value=readDraft()?.title||getBank()[0]?.sourceName||'';
  dialog.showModal();
 };
 $('publishDeck').addEventListener('click',()=>{if(dialog.open)$('publishSubmit').textContent=readDraft()?'Tiếp tục tải lên':'Đăng bộ đề'});

 function cards(){
  const searchEl=$('deckSearch'),term=searchEl?searchEl.value.trim().toLocaleLowerCase():'',filtered=term?items.filter(d=>d.title.toLocaleLowerCase().includes(term)):items;
   $('deckList').innerHTML=(filtered.length?filtered.map(d=>{
   const isOwner=owned().includes(d.id);
   return `<article class="card shared-deck ${isOwner?'is-owner-deck':''}">
     <div class="shared-deck-topbar">
       <span class="deck-type-tag ${isOwner?'owner-tag':'community-tag'}">
         ${isOwner?'⭐ Bộ đề của bạn':'🌐 Bộ đề công khai'}
       </span>
       <span class="shared-deck-date">📅 ${new Date(d.created).toLocaleDateString('vi-VN')}</span>
     </div>
     <div class="shared-deck-main">
       <h3 class="shared-deck-title" title="${esc(d.title)}">${esc(d.title)}</h3>
       <div class="shared-deck-badges">
         <span class="shared-badge count">📚 <b>${d.count}</b> câu</span>
         <span class="shared-badge">🖼️ Slide gốc</span>
         <span class="shared-badge">💡 Có giải thích AI</span>
       </div>
     </div>
     <div class="shared-deck-footer shared-deck-actions">
       <button class="btn-deck-use shared-use-btn" data-use-deck="${esc(d.id)}">
         <span>Vào ôn luyện ngay</span>
         <span class="btn-arrow">→</span>
       </button>
       ${isOwner?`<button class="btn-deck-remove" data-delete-deck="${esc(d.id)}" title="Gỡ bộ đề khỏi kho chung" aria-label="Gỡ bộ đề khỏi kho chung">
         <span class="del-icon">🗑️</span>
         <span class="del-text">Gỡ đề</span>
       </button>`:''}
     </div>
   </article>`;
   }).join(''):'<div class="empty"><h2>Chưa có bộ đề phù hợp</h2><p>Nhập và kiểm tra tài liệu của bạn, sau đó chủ động đăng vào kho chung.</p><button data-view="sources">Chọn tài liệu →</button></div>');
 }
 async function load(){
  if(loading)return;loading=true;$('deckStatus').textContent='Đang tải kho đề…';
  try{items=await(await deckRequest(base,'/v1/decks')).json();if(!Array.isArray(items))throw Error('Không đọc được danh sách bộ đề.');cards();$('deckStatus').textContent=''}
  catch(error){$('deckStatus').textContent=error.message}
  finally{loading=false}
 }
 if($('refreshDecks'))$('refreshDecks').onclick=load;if($('deckSearch'))$('deckSearch').oninput=cards;
 section.addEventListener('click',async e=>{
  const useLocal=e.target.closest('[data-use-local]');
  if(useLocal){
   if(!canChange())return;
   onUseLocal?.();
   return;
  }
  const use=e.target.closest('[data-use-deck]'),remove=e.target.closest('[data-delete-deck]');if(!use&&!remove)return;if(!canChange())return;
  const button=use||remove,id=use?.dataset.useDeck||remove.dataset.deleteDeck;button.disabled=true;
  try{
   if(remove){
    if(!await askConfirm('Gỡ bộ đề khỏi kho chung? Ảnh của bộ đề sẽ không còn truy cập được.',{title:'Gỡ bộ đề',danger:true,okText:'Gỡ bộ đề'}))return;
    await deckRequest(base,'/v1/decks/'+id,{method:'DELETE',token:getToken()});await load();return;
   }
   const deck=await(await deckRequest(base,'/v1/decks/'+id)).json();onUse(deck);
  }catch(error){$('deckStatus').textContent=error.message}finally{button.disabled=false}
 });

 $('publishForm').onsubmit=async e=>{
  e.preventDefault();if(controller||!canChange()||!$('publishRights').checked)return;
  let token;try{token=getToken()}catch(error){setStatus(error.message);return}
  const questions=structuredClone(getBank().filter(readyForPractice));if(!questions.length||questions.length>500)return;
  controller=new AbortController();const signal=controller.signal;let draft=null,published=false;
  const fingerprint=JSON.stringify([$('deckTitle').value.trim(),questions.map(q=>[q.sourceId,q.url,q.sharedDeck,q.sharedIndex,q.stem,q.options,q.answer,q.explanation,q.verified,q.answerSource])]);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint)),signature=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  $('deckTitle').disabled=true;$('publishRights').disabled=true;$('publishSubmit').disabled=true;$('stopPublish').hidden=false;$('publishBar').hidden=false;$('publishBar').max=questions.length;$('publishBar').value=0;
  dialog.close();
  updateProgress({status:'Đang chuẩn bị đăng đề ở nền. Bạn có thể tiếp tục thao tác.',current:0,total:questions.length,isRunning:true});
  try{
   const saved=readDraft();let completed=[];
   if(saved?.signature===signature){
    try{const state=await(await deckRequest(base,'/v1/decks/'+saved.id+'/draft',{token:getToken(),signal})).json();draft={id:saved.id,uploadToken:state.uploadToken};completed=state.uploaded||[];if(state.published)completed=questions.map((_,i)=>i)}
    catch(error){if(error.status!==404)throw error;saveDraft(null)}
   }
   if(!draft){
    draft=await(await deckRequest(base,'/v1/decks',{method:'POST',token,body:{title:$('deckTitle').value.trim(),count:questions.length,rights:true},signal})).json();
    saveDraft({id:draft.id,signature,title:$('deckTitle').value.trim()});
   }
   let done=completed.length,cursor=0;const remaining=questions.map((q,index)=>({q,index})).filter(item=>!completed.includes(item.index));
   updateProgress({current:done,total:questions.length,isRunning:true});
   const upload=async()=>{
    while(cursor<remaining.length){
     const batch=remaining.slice(cursor,cursor+5);cursor+=5;
     if(signal.aborted)throw new DOMException('Stopped','AbortError');
     updateProgress({status:`Đang tải nền ${done}/${questions.length} ảnh. Bạn có thể tiếp tục ôn luyện.`,current:done,total:questions.length,isRunning:true});
     const prepared=await Promise.all(batch.map(async({q,index})=>{
      const blob=await getBlob(q,{signal,maxBytes:819200,onWait:info=>!signal.aborted&&updateProgress({status:`Google điều tiết tải ảnh. Tự chờ ${Math.ceil(info.ms/1000)}s · đã giữ ${done}/${questions.length} ảnh.`,current:done,total:questions.length,isRunning:true})});
      if(blob.size>819200)throw Error(`Ảnh slide ${q.slide} lớn hơn 800 KB; phần đã tải vẫn được giữ.`);
      return {index,image:{mimeType:blob.type,data:await blobToBase64(blob)},question:Object.fromEntries(['stem','options','answer','explanation','explanationSource','verified','answerSource','slide','url','sourceName'].map(key=>[key,q[key]]))};
     }));
     if(draft.uploadToken)await deckRequest(base,`/v1/decks/${draft.id}/questions-batch`,{method:'PUT',uploadToken:draft.uploadToken,body:{items:prepared},signal});
     else for(const item of prepared)await deckRequest(base,`/v1/decks/${draft.id}/questions/${item.index}`,{method:'PUT',token:getToken(),body:{question:item.question,image:item.image},signal});
     done+=prepared.length;
     updateProgress({status:`Đã tải ${done}/${questions.length} ảnh. Đang đăng ở nền…`,current:done,total:questions.length,isRunning:true});
    }
   };
   await Promise.all(Array.from({length:Math.min(3,Math.ceil(remaining.length/5))},upload));
   await deckRequest(base,`/v1/decks/${draft.id}/publish`,{method:'POST',token:getToken(),body:{},signal});
   const ids=owned();ids.push(draft.id);try{localStorage.setItem('sot-published-decks',JSON.stringify(ids))}catch{}
   saveDraft(null);draft=null;published=true;
   updateProgress({status:'Đã đăng thành công bộ đề! Mọi người có thể chọn trong Kho đề chung.',current:questions.length,total:questions.length,isRunning:false,success:true});
   await load();
  }catch(error){
   controller.abort();
   updateProgress({status:(error.name==='AbortError'?'Đã tạm dừng tải lên.':error.message)+' Các ảnh đã tải được giữ tạm tối đa 24 giờ.',isRunning:false,error:true});
  }finally{
   controller=null;$('deckTitle').disabled=false;$('publishRights').disabled=false;$('publishSubmit').disabled=published;
   if(!published&&readDraft())$('publishSubmit').textContent='Tiếp tục tải lên';
   $('closePublish').disabled=false;$('stopPublish').hidden=true;
  }
 };

 const savedDraft=readDraft();
 if(savedDraft){
  updateProgress({status:'Có bản tải lên dở dang được giữ tạm (24h). Bấm Tiếp tục tải để đăng nốt.',isRunning:false,error:false});
 }

 return {load,isPublishing:()=>!!controller,pause:()=>controller?.abort()};
}
