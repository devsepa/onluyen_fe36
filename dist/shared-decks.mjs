import {blobToBase64,readyForPractice} from './ai.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sharedImagePath(q){if(!/^[a-f0-9-]{36}$/.test(q.sharedDeck)||!Number.isInteger(q.sharedIndex)||q.sharedIndex<0)throw Error('Ảnh trong kho không hợp lệ.');return `/v1/decks/${q.sharedDeck}/images/${q.sharedIndex}`}
export async function deckRequest(base,path,{method='GET',token,body,signal,fetcher=fetch}={}){
 if(!base)throw Error('Kho đề đang được chuẩn bị.');const root=new URL(base);if(root.protocol!=='https:'&&!(root.protocol==='http:'&&['localhost','127.0.0.1'].includes(root.hostname)))throw Error('Kho đề chưa sẵn sàng.');
 const response=await fetcher(new URL(path,root),{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal});
 if(!response.ok){let data;try{data=await response.json()}catch{}throw Error(data?.error||'Chưa kết nối được kho đề. Hãy thử lại.')}return response;
}
export function setupSharedDecks({base,getBank,getToken,getBlob,canChange,onUse}){
 const $=id=>document.getElementById(id),section=$('shared'),dialog=document.createElement('dialog'),publishButton=document.createElement('button');publishButton.id='publishDeck';publishButton.className='secondary';publishButton.textContent='↑ Đăng vào kho chung';$('library').querySelector('.section-heading .row').prepend(publishButton);dialog.className='publish-dialog';dialog.setAttribute('aria-labelledby','publishTitle');
 dialog.innerHTML='<form id="publishForm"><div class="modal-heading"><h2 id="publishTitle">Đăng bộ đề vào kho chung</h2><button type="button" class="secondary" id="closePublish">Đóng</button></div><label>Tên bộ đề<input id="deckTitle" required maxlength="160" placeholder="Ví dụ: DBI202 · Học kỳ 3"></label><p id="publishCount"></p><p>Ảnh slide, đáp án và giải thích sẽ công khai cho mọi người. Link Google riêng vẫn giữ quyền truy cập của Google. Lịch sử và thông tin tài khoản không được chia sẻ.</p><label class="check-label"><input id="publishRights" type="checkbox" required> Tôi có quyền chia sẻ các ảnh slide và nội dung này.</label><p id="publishStatus" role="status" aria-live="polite"></p><progress id="publishBar" value="0" max="1" hidden></progress><div class="modal-actions"><button type="submit" id="publishSubmit">Đăng bộ đề</button><button type="button" id="stopPublish" class="secondary" hidden>Dừng tải lên</button></div></form>';
 document.body.append(dialog);let controller=null,items=[],loading=false;const owned=()=>{try{return JSON.parse(localStorage.getItem('sot-published-decks')||'[]')}catch{return []}};
 $('closePublish').onclick=()=>{if(!controller)dialog.close()};dialog.addEventListener('cancel',e=>{if(controller)e.preventDefault()});$('stopPublish').onclick=()=>controller?.abort();
 $('publishDeck').onclick=()=>{if(!canChange())return;const ready=getBank().filter(readyForPractice);$('publishCount').textContent=`Đăng ${ready.length} câu có đáp án / ${getBank().length} câu. Câu thiếu đáp án không được đăng.`;$('publishStatus').textContent='';$('publishBar').hidden=true;$('publishRights').checked=false;$('publishSubmit').disabled=!ready.length||ready.length>500;$('deckTitle').value=getBank()[0]?.sourceName||'';dialog.showModal()};
 function cards(){const term=$('deckSearch').value.trim().toLocaleLowerCase(),filtered=items.filter(d=>d.title.toLocaleLowerCase().includes(term));$('deckList').innerHTML=filtered.length?filtered.map(d=>`<article class="card shared-deck"><span class="overline">BỘ ĐỀ CỘNG ĐỒNG</span><h2>${esc(d.title)}</h2><p>${d.count} câu · ${new Date(d.created).toLocaleDateString('vi-VN')}</p><p>Ảnh slide gốc · Random câu hỏi · Giữ thứ tự đáp án</p><div class="row"><button data-use-deck="${esc(d.id)}">Chọn bộ đề →</button>${owned().includes(d.id)?`<button class="text-button danger" data-delete-deck="${esc(d.id)}">Gỡ bộ đề</button>`:''}</div></article>`).join(''):'<div class="empty"><h2>Chưa có bộ đề phù hợp</h2><p>Nhập và kiểm tra tài liệu của bạn, sau đó chủ động đăng vào kho chung.</p><button data-view="sources">Chọn tài liệu →</button></div>'}
 async function load(){if(loading)return;loading=true;$('deckStatus').textContent='Đang tải kho đề…';try{items=await(await deckRequest(base,'/v1/decks')).json();if(!Array.isArray(items))throw Error('Không đọc được danh sách bộ đề.');cards();$('deckStatus').textContent=`${items.length} bộ đề công khai. Chọn bộ đề để ôn ngay, không cần quét lại.`}catch(error){$('deckStatus').textContent=error.message}finally{loading=false}}
 $('refreshDecks').onclick=load;$('deckSearch').oninput=cards;
 section.addEventListener('click',async e=>{
  const use=e.target.closest('[data-use-deck]'),remove=e.target.closest('[data-delete-deck]');if(!use&&!remove)return;if(!canChange())return;const button=use||remove,id=use?.dataset.useDeck||remove.dataset.deleteDeck;button.disabled=true;
  try{
   if(remove){if(!confirm('Gỡ bộ đề khỏi kho chung? Ảnh của bộ đề sẽ không còn truy cập được.'))return;await deckRequest(base,'/v1/decks/'+id,{method:'DELETE',token:getToken()});await load();return}
   if(getBank().length&&!confirm('Dùng bộ đề này thay ngân hàng hiện tại? Lịch sử bài làm vẫn được giữ.'))return;
   const deck=await(await deckRequest(base,'/v1/decks/'+id)).json();onUse(deck);
  }catch(error){$('deckStatus').textContent=error.message}finally{button.disabled=false}
 });
 $('publishForm').onsubmit=async e=>{
  e.preventDefault();if(controller||!canChange()||!$('publishRights').checked)return;
  let token;try{token=getToken()}catch(error){$('publishStatus').textContent=error.message;return}
  const questions=structuredClone(getBank().filter(readyForPractice));if(!questions.length||questions.length>500)return;
  controller=new AbortController();const signal=controller.signal;let draft=null;
  $('publishSubmit').disabled=true;$('closePublish').disabled=true;$('stopPublish').hidden=false;$('publishBar').hidden=false;$('publishBar').max=questions.length;$('publishBar').value=0;
  try{
   draft=await(await deckRequest(base,'/v1/decks',{method:'POST',token,body:{title:$('deckTitle').value.trim(),count:questions.length,rights:true},signal})).json();
   for(let i=0;i<questions.length;i++){
    if(signal.aborted)throw new DOMException('Stopped','AbortError');$('publishStatus').textContent=`Đang tải ảnh ${i+1}/${questions.length}. Bộ đề chưa công khai.`;
    const blob=await getBlob(questions[i]);if(blob.size>819200)throw Error(`Ảnh slide ${questions[i].slide} lớn hơn 800 KB; chưa đăng bộ đề.`);
    const image={mimeType:blob.type,data:await blobToBase64(blob)},q=questions[i],question=Object.fromEntries(['stem','options','answer','explanation','verified','answerSource','slide','url','sourceName'].map(key=>[key,q[key]]));await deckRequest(base,`/v1/decks/${draft.id}/questions/${i}`,{method:'PUT',token:getToken(),body:{question,image},signal});$('publishBar').value=i+1;
   }
   await deckRequest(base,`/v1/decks/${draft.id}/publish`,{method:'POST',token:getToken(),body:{},signal});const ids=owned();ids.push(draft.id);try{localStorage.setItem('sot-published-decks',JSON.stringify(ids))}catch{}draft=null;$('publishStatus').textContent='Đã đăng bộ đề. Mọi người có thể chọn trong Kho đề chung.';await load();
  }catch(error){$('publishStatus').textContent=error.name==='AbortError'?'Đã dừng. Bộ đề chưa được công khai.':error.message;if(draft)try{await deckRequest(base,'/v1/decks/'+draft.id,{method:'DELETE',token:getToken()})}catch{}}
  finally{controller=null;$('publishSubmit').disabled=false;$('closePublish').disabled=false;$('stopPublish').hidden=true}
 };
 return {load,isPublishing:()=>!!controller};
}
