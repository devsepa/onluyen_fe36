import {practiceSubjects,subjectKey} from './subjects.mjs?v=2026.11.15.40';
import {sessionSummary,learningStats} from './study-progress.mjs?v=2026.11.15.40';
import {explanationKey} from './explanation-data.mjs?v=2026.11.15.40';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
export function setupStudyTools({getBank,getSession,getHistory,saveBank,getBlob,media,resume,practice,base}){
 const root=el('section',undefined,'study-tools'),resumeBox=el('div'),offlineBox=el('details',undefined,'card study-downloads');root.append(resumeBox,offlineBox);document.getElementById('shared').prepend(root);
 let downloading=false;
 const read=()=>{try{return JSON.parse(localStorage.getItem('sot-offline-packs')||'{}')}catch{return {}}};
 function render(){
  resumeBox.replaceChildren();const summary=sessionSummary(getSession());
  if(summary){const card=el('article',undefined,'card study-resume'),body=el('div');body.append(el('h2','Bài đang dở'),el('p',`${summary.title} · ${summary.answered}/${summary.total} câu đã trả lời · đang ở câu ${summary.current}${summary.expired?' · Đã hết giờ':''}`));const button=el('button',summary.expired?'Xem bài đã hết giờ':'Học tiếp');button.onclick=resume;card.append(body,button);resumeBox.append(card)}
  if(downloading)return;
  offlineBox.replaceChildren(el('summary','Bộ đề trên thiết bị · Offline & giải thích đã duyệt'));
  const groups=practiceSubjects(getBank()),packs=read();
  if(!groups.length)offlineBox.append(el('p','Mở một bộ đề trong kho để lưu câu hỏi, rồi quay lại đây tải ảnh để học offline.'));
  for(const group of groups){const row=el('div',undefined,'study-pack-row'),label=el('div');label.append(el('strong',group.label),el('small',`${group.count} câu${packs[group.key]?` · lần tải gần nhất: ${packs[group.key].count} ảnh`:' · chưa tải ảnh offline'}`));const actions=el('div',undefined,'row'),download=el('button','Tải để học offline','secondary'),open=el('button','Ôn bộ này','secondary'),review=el('button','Giải thích đã duyệt','secondary');
   open.onclick=()=>practice(group.key);download.onclick=()=>downloadPack(group.key,row);review.onclick=()=>reviewed(group.key);actions.append(open,download,review);row.append(label,actions);offlineBox.append(row)}
  offlineBox.append(el('p','Tải offline lưu thêm ảnh gốc cùng câu hỏi và giải thích đã có, không gọi AI mới. Trình duyệt có thể thu hồi dữ liệu khi thiếu dung lượng.','muted'));
 }
 async function downloadPack(key,row){
  if(downloading)return;downloading=true;const controller=new AbortController(),status=el('p','Đang chuẩn bị…'),stop=el('button','Dừng','secondary');stop.onclick=()=>controller.abort();row.append(status,stop);
  status.setAttribute('role','status');
  const questions=getBank().filter(q=>subjectKey(q)===key);let count=0;
  try{
   if(!navigator.serviceWorker?.controller)throw Error('Hãy tải lại trang khi có mạng để bật học offline, rồi tải bộ đề.');
   for(let i=0;i<questions.length;i++){const q=questions[i];controller.signal.throwIfAborted();if(q.url||q.sharedDeck||q.mediaId){const blob=await getBlob(q,{signal:controller.signal}),id=await media.put(blob);await media.link(q,id);count++}status.textContent=`Đã lưu ${count} ảnh · đang kiểm tra câu ${i+1}/${questions.length}`}
   if(!questions.every(q=>getBank().some(b=>b.id===q.id)))throw Error('Bộ đề đã thay đổi trong lúc tải. Hãy tải lại bộ này.');
   const packs=read();packs[key]={count,ids:questions.map(q=>q.id),savedAt:Date.now()};localStorage.setItem('sot-offline-packs',JSON.stringify(packs));const persistent=await media.persist();status.textContent=`Đã tải xong ${questions.length} câu và ${count} ảnh.${persistent?'':' Nên giữ bản sao ZIP nếu cần lưu lâu dài.'}`;
  }catch(error){status.textContent=error.name==='AbortError'?'Đã dừng. Ảnh đã tải vẫn được giữ; có thể tải lại để hoàn tất.':error.message}finally{downloading=false;stop.remove()}
 }
 async function reviewed(key){
  const d=el('dialog',undefined,'study-tools-dialog'),head=el('div',undefined,'modal-heading'),close=el('button','Đóng','secondary'),status=el('p','Đang đọc bản đã lưu…'),list=el('div');close.onclick=()=>d.close();head.append(el('h2','Kho giải thích đã kiểm duyệt'),close);d.append(head,status,list);document.body.append(d);d.onclose=()=>d.remove();d.showModal();
  const questions=getBank().filter(q=>subjectKey(q)===key);let count=0;
  for(const q of questions){let details=q.explanationDetails;
   if(details?.cacheKey&&navigator.onLine){try{const r=await fetch(new URL(`/v1/explanations/${details.cacheKey}/reviewed`,base),{signal:AbortSignal.timeout(8000)});if(r.ok){const data=await r.json(),a=data.result.answers[0];if(a.answer===q.answer){details={...details,key:explanationKey(q),reason:a.explanation,options:a.optionReasons,reviewed:true,cacheEtag:data.etag};q.explanationDetails=details;saveBank(q,details)}}else if(r.status===404&&details.reviewed){details={...details,reviewed:false};q.explanationDetails=details;saveBank()}}catch{/* Keep the offline copy. */}}
   if(!d.isConnected)return;
   if(!details?.reviewed||details.answer!==q.answer||details.key!==explanationKey(q))continue;
   count++;const card=el('article',undefined,'card');card.append(el('h3',`Slide ${q.slide||count} · Đã kiểm duyệt`),el('p',q.stem),el('strong',`Đáp án: ${details.answer}`),el('p',details.reason));for(const o of details.options||[])card.append(el('p',`${o.id}. ${o.text} — ${o.reason}`));list.append(card);
  }
  status.textContent=count?`${count} câu có giải thích đã duyệt. Khi offline, hiển thị bản gần nhất đã lưu; có thể báo lỗi trong màn hình ôn.`:'Chưa có giải thích đã kiểm duyệt cho các câu đã lưu của bộ này. Đáp án AI gợi ý không tự được coi là đã duyệt.';
 }
 function analytics(target){const stats=learningStats(getHistory()),section=el('section',undefined,'card learning-insights');section.append(el('h2','Điểm yếu & tiến bộ'),el('p','Tính từ tối đa 50 bài còn lưu trên thiết bị. Đúng lần đầu tính cả các lần thử sai trong buổi ôn.'));
  for(const g of stats.subjects){const row=el('div',undefined,'study-pack-row');row.append(el('strong',g.label),el('span',`${g.correct}/${g.attempted} đúng · ${g.attempted?Math.round(g.firstTry/g.attempted*100):0}% đúng lần đầu · bỏ trống ${g.skipped}`),el('small',`Các lần gần nhất: ${g.scores.slice(-5).map(n=>n+'%').join(' → ')||'Chưa trả lời'}`));section.append(row)}
  if(stats.weak.length){section.append(el('h3','Câu cần củng cố'));for(const item of stats.weak){const q=item.question;section.append(el('p',`${q.sourceName||'Tài liệu'} · Slide ${q.slide||'—'}: ${q.stem||'Xem ảnh gốc'} — sai ${item.wrong} bài, thử sai ${item.retries} lần`))}}else section.append(el('p','Chưa có câu sai được ghi nhận.'));
  target.querySelector('.section-heading')?.after(section);
 }
 return {render,analytics};
}
