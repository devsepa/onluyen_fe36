import {shuffle,grade,answerQuestion,optionState,cleanQuestion,normalizeAnswer,isCorrect,confirmQuestion,updateQuestionContent} from './core.mjs?v=20261113-vision-1';
import {setupResources} from './resources-ui.js?v=20261113-vision-1';
import {presentationIdFromLink} from './resources.mjs';
import {validateBank} from './banks.mjs?v=20261113-vision-1';
import {setupAccount} from './account-ui.js?v=20261113-vision-1';
import {AI_API_BASE} from './site-config.mjs?v=20261113-vision-1';
import {solveBatch,applyAiResults,readyForPractice,verifyOrSolveWithDirectGemini,blobToBase64} from './ai.mjs?v=20261113-vision-1';
import {createSlideImageStore} from './slide-images.mjs?v=20261113-vision-1';
import {setupSlidePreview} from './slide-preview.mjs?v=20261113-vision-1';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
let bank=read('sot-bank',[]),history=read('sot-history',[]),session=read('sot-session',null),sourceSummary=read('sot-source','');
const originalStorage=new Map([['sot-bank',JSON.stringify(bank)],['sot-history',JSON.stringify(history)],['sot-session',JSON.stringify(session)]]);
bank=bank.filter(q=>q.sourceId||presentationIdFromLink(q.url)).map(q=>cleanQuestion({...q,sourceId:q.sourceId||presentationIdFromLink(q.url)}));
history=history.map(r=>({...r,questions:r.questions.map(cleanQuestion)}));
if(session)session={...session,questions:session.questions.map(cleanQuestion)};
if(session?.questions.some(q=>!q.sourceId&&!presentationIdFromLink(q.url)))session=null;
let view=bank.length?'library':'sources',lastResult=null,preferredMode='study',page=1,editing=null,resultFilter='all';
const pageSize=10;
const pageInfo={
 sources:['Tài liệu của tôi','Tài liệu của tôi','Chọn tài liệu và nhập câu hỏi từ slide.'],
 library:['Ngân hàng câu hỏi','Ngân hàng câu hỏi','Đáp án rõ ràng trong ghi chú được dùng ngay. Chỉ cần kiểm tra câu thiếu đáp án.'],
 practice:['Ôn luyện & Thi thử','Ôn luyện & Thi thử','Chọn chế độ, nguồn câu hỏi và số câu để bắt đầu làm bài.'],
 history:['Lịch sử & Kết quả','Lịch sử & Kết quả','Xem các bài đã nộp và mở lại kết quả chi tiết.'],
 result:['Lịch sử & Kết quả','Kết quả bài làm','Đối chiếu đáp án và chọn những câu cần ôn lại.']
};
const notices=new Map();
function renderNotice(){const text=notices.get(view)||'';$('message').textContent=text;$('message').hidden=!text}
function message(text,scope=view){notices.set(scope,text);if(scope===view)renderNotice()}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{message('Không thể lưu dữ liệu. Hãy kiểm tra dung lượng lưu trữ trên trình duyệt.');return false}}
function sources(){return [...new Map(bank.map(q=>[q.sourceId,q.sourceName||'Tài liệu đã nhập'])).entries()]}
function sourceReference(q,compact=false){
 const slide=Number.isInteger(q.slide)&&q.slide>0?q.slide:null;
 const link=presentationIdFromLink(q.url)?q.url:null;
 if(compact)return `<div class="source-reference source-reference-compact" data-slide="${slide||''}"><div class="source-location"><strong>${slide?`Slide ${slide}`:'Chưa có số slide'}</strong>${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Mở ${slide?'slide '+slide:'tài liệu'} gốc trong tab mới">Mở slide ↗</a>`:''}</div></div>`;
 return `<div class="source-reference" data-slide="${slide||''}"><div><span class="source-label">NGUỒN CÂU HỎI</span><span class="source-document">${esc(q.sourceName||'Tài liệu đã nhập')}</span></div><div class="source-location"><strong>${slide?`Slide gốc ${slide}`:'Chưa có số slide'}</strong>${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Mở ${slide?'slide '+slide:'tài liệu'} gốc trong tab mới">Mở slide ↗</a>`:''}</div></div>`;
}
function refreshStats(){$('total').textContent=bank.length;$('ready').textContent=bank.filter(readyForPractice).length;$('navQuestionCount').textContent=bank.length}
function aiBadge(q){return q.answerSource==='gemini'?'<span class="tag ai-answer-label">✦ Đáp án AI gợi ý</span>':''}
function hasAiInput(q){return !!q.url||hasAiText(q)}
function hasAiText(q){return q.stem?.trim()&&q.options.length>=2&&q.options.every(o=>typeof o.text==='string'&&o.text.trim())}
const slideImages=createSlideImageStore(q=>resources.slideImage(q));window.addEventListener('pagehide',()=>slideImages.clear());
function displayContent(q){
 if(q.content)return q.content;
 if(q.options&&q.options.some(o=>o.text&&o.text.trim())){
  const hasOptionsInStem=/(?:^|\n)[ \t]*(?:[•●▪][ \t]*)?(?:[（(][A-H][）)]|[［\[][A-H][］\]]|[A-H][.)．）：:])/m.test(q.stem);
  if(hasOptionsInStem)return q.stem;
  return q.stem+'\n\n'+q.options.filter(o=>o.text).map(o=>o.id+'. '+o.text).join('\n');
 }
 return q.stem;
}
function saveBank(){bank=bank.map(cleanQuestion);write('sot-bank',bank);refreshStats();renderLibrary()}
function empty(title,description,target='sources',label='Chọn tài liệu →'){return `<div class="empty"><span class="empty-icon">▱</span><h2>${esc(title)}</h2><p>${esc(description)}</p><button data-view="${target}">${esc(label)}</button></div>`}
function switchView(next,mode){
 if(!pageInfo[next])return;
 if(session&&!session.done&&session.mode!=='study'&&next!=='practice')return message('Hãy nộp bài thi thử trước khi mở tài liệu hoặc kết quả.');
 if(mode)preferredMode=mode;
 if(next==='result'&&!lastResult)next='history';
 view=next;renderNotice();
 for(const id of Object.keys(pageInfo))$(id).hidden=id!==view;
 const activeNav=view==='result'?'history':view;
 document.querySelectorAll('[data-view].nav').forEach(button=>{button.classList.toggle('active',button.dataset.view===activeNav);if(button.dataset.view===activeNav)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
 const [crumb,title,description]=pageInfo[view];$('breadcrumb').textContent=crumb;$('pageTitle').textContent=title;$('pageDescription').textContent=description;
 $('pageHeading').hidden=view==='practice'&&!!session&&!session.done;
 document.body.classList.toggle('exam-active',!!session&&!session.done&&session.mode!=='study');
 refreshStats();if(view==='library')renderLibrary();if(view==='practice')renderPractice();if(view==='history')renderHistory();if(view==='result')renderResult(lastResult);
}
document.addEventListener('click',event=>{const action=event.target.closest('[data-view]');if(action){event.preventDefault();switchView(action.dataset.view,action.dataset.mode)}});
const account=setupAccount({onConnect:options=>{
 if(session&&!session.done)return message('Hoàn thành bài đang làm trước khi đổi tài khoản Google.');
 resources.connect(options);
},onDisconnect:()=>{aiController?.abort();slideImages.clear();resources.disconnect()}});
const resources=setupResources({onAccountChange:profile=>{
 account.update(profile);$('sourceAccessNotice').hidden=!!profile;$('sourceControls').hidden=!profile;
 if(profile)setTimeout(scheduleAutoAi,0);
},onAccountError:text=>message(text),message:text=>message(text,'sources'),hasActiveSession:()=>!!session&&!session.done,onImport:result=>{
 if(aiRunning||session&&!session.done){message('Dừng AI và hoàn thành bài đang làm trước khi thay ngân hàng câu hỏi.','sources');return false}
 if(!write('sot-bank',result.questions))return false;
 bank=result.questions;sourceSummary=result.sources.map(s=>s.name).join(' · ');write('sot-source',sourceSummary);page=1;refreshStats();if(view==='library')renderLibrary();$('openImportedBank').hidden=false;$('openImportedBank').textContent=`Kiểm tra ${bank.length} câu hỏi đã nhập →`;scheduleAutoAi();return true;
}});
setupSlidePreview({getQuestion:id=>bank.find(q=>q.id===id)||session?.questions.find(q=>q.id===id)||lastResult?.questions.find(q=>q.id===id),getImage:q=>resources.slideImage(q)});

function filteredQuestions(){const term=$('search').value.trim().toLowerCase(),source=$('sourceFilter').value;return bank.filter(q=>(!source||q.sourceId===source)&&(!$('unverified').checked||!q.verified)&&q.stem.toLowerCase().includes(term))}
async function showQuestionImage(container,q){
 if(!container?.isConnected||!q.url)return;
 const text=container.parentElement?.querySelector('.question-title');
 text?.classList.add('collapsed-text');
 container.replaceChildren();const loading=document.createElement('div');loading.className='slide-media-loading';loading.textContent='Đang tải ảnh slide gốc…';container.append(loading);
 try{
  const url=await slideImages.get(q);if(!container.isConnected)return;
  const image=document.createElement('img');image.alt='Slide '+q.slide;image.className=container.classList.contains('library-slide-media')?'library-slide-img':'slide-media-img';image.dataset.previewSlide=q.id;image.title='Bấm để phóng to ảnh gốc';
  image.onload=()=>{if(container.isConnected)text?.classList.add('collapsed-text')};
  image.onerror=()=>{slideImages.invalidate(q.url);showSlideError(container,q)};
  image.src=url;container.replaceChildren(image);
 }catch{if(container.isConnected)showSlideError(container,q)}
}
function showSlideError(container,q){
 container.innerHTML='<p>Chưa tải được ảnh slide gốc. Kiểm tra kết nối và đăng nhập Google ở góc phải nếu phiên đã hết hạn.</p>';
 container.classList.add('slide-load-error');
 const retry=document.createElement('button');retry.className='secondary';retry.type='button';retry.textContent='Thử tải lại ảnh';retry.onclick=()=>{container.classList.remove('slide-load-error');showQuestionImage(container,q)};
 const link=document.createElement('a');link.href=q.url;link.target='_blank';link.rel='noopener';link.textContent='Mở slide gốc ↗';container.append(retry,link);
}
async function loadLibrarySlideImages(qs){
 for(const q of qs){const container=document.querySelector('.library-slide-media[data-lib-slide="'+CSS.escape(q.id)+'"]');if(!container?.isConnected)continue;await showQuestionImage(container,q)}
}
function renderLibrary(){
 refreshStats();$('source').textContent=bank.length?(sourceSummary||`${sources().length} tài liệu đã nhập`):'Bắt đầu từ tài liệu Google Slides của bạn.';
 const chosen=$('sourceFilter').value;$('sourceFilter').innerHTML='<option value="">Tất cả tài liệu</option>'+sources().map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');if(sources().some(([id])=>id===chosen))$('sourceFilter').value=chosen;
 const all=filteredQuestions(),pages=Math.max(1,Math.ceil(all.length/pageSize));page=Math.max(1,Math.min(page,pages));const qs=all.slice((page-1)*pageSize,page*pageSize);
 $('questionCount').textContent=`${all.length} câu hỏi${all.length?` · Hiển thị ${(page-1)*pageSize+1}–${Math.min(page*pageSize,all.length)}`:''}`;
 $('exportBank').disabled=!bank.length;$('verifyPage').disabled=!qs.some(q=>q.answer&&!q.verified);$('clear').disabled=!bank.length||aiRunning;
 renderAi();
 $('questions').innerHTML=qs.length?qs.map((q,i)=>`<article class="card question-card"><div class="question-top"><div class="question-source">CÂU ${(page-1)*pageSize+i+1} · ${esc(q.sourceName||'Tài liệu đã nhập')}<br><a href="${esc(q.url)}" target="_blank" rel="noopener">Slide ${q.slide} ↗</a> ${q.extraction==='ocr'?' · Nhận dạng từ ảnh':''}</div><span class="tag ${q.verified?'ok':''}">${q.answerSource==='gemini'?'✦ Đáp án AI gợi ý':q.verified?(q.answerSource==='speaker-notes'?'✓ Đáp án từ ghi chú':'✓ Đáp án đã xác nhận'):'Chờ kiểm tra'}</span></div>${sourceReference(q)}<div class="library-slide-media" data-lib-slide="${esc(q.id)}"></div><div class="question-title ${q.url?'collapsed-text':''}">${esc(displayContent(q))}</div><div class="choice-pills choice-pills-sm">${q.options.map(o=>`<span class="choice-pill static-pill ${q.answer.includes(o.id)?'correct':''}">${esc(o.id)}</span>`).join('')}<span class="pill-answer-label">Đáp án: <strong>${esc(q.answer||'Chưa có')}</strong></span></div>${q.answerSource==='gemini'&&q.explanation?`<details class="note-explanation"><summary>Giải thích AI · cần kiểm tra</summary><p>${esc(q.explanation)}</p></details>`:''}${q.explanation&&q.answerSource!=='gemini'?`<details class="note-explanation"><summary>Ghi chú / Giải thích</summary><p>${esc(q.explanation)}</p></details>`:''}${q.aiStatus==='uncertain'?`<p class="muted">AI chưa xác định: ${esc(q.aiReason)}</p>`:''}<div class="question-bottom"><label>Đáp án đúng<input data-answer="${esc(q.id)}" aria-label="Đáp án đúng của câu ${(page-1)*pageSize+i+1}" value="${esc(q.answer)}" placeholder="A, AD, ACE…" maxlength="24" autocomplete="off"></label><div class="row"><button class="${q.verified?'secondary':''}" data-verify="${esc(q.id)}">${q.verified?'Bỏ xác nhận':'✓ Xác nhận'}</button>${q.extraction==='ocr'?`<button class="secondary" data-preview-slide="${esc(q.id)}">Đối chiếu ảnh gốc</button>`:''}<button class="secondary" data-edit="${esc(q.id)}">Sửa câu hỏi</button><button class="text-button danger" data-delete="${esc(q.id)}">Xóa</button></div></div></article>`).join(''):empty(bank.length?'Không có câu hỏi phù hợp':'Ngân hàng đang chờ tài liệu',bank.length?'Thử từ khóa khác hoặc bỏ bộ lọc để xem thêm câu hỏi.':'Nhập bộ slide của bạn. Các câu hỏi nhận diện được sẽ xuất hiện ở đây để kiểm tra.');
 $('pagination').innerHTML=all.length?`<button class="secondary" data-page="${page-1}" ${page===1?'disabled':''}>← Trước</button><span>Trang ${page} / ${pages}</span><button class="secondary" data-page="${page+1}" ${page===pages?'disabled':''}>Sau →</button>`:'';
 setTimeout(()=>loadLibrarySlideImages(qs),0);
}
for(const id of ['search','sourceFilter','unverified'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;renderLibrary()});
$('pagination').onclick=e=>{const target=e.target.closest('[data-page]');if(target){page=Number(target.dataset.page);renderLibrary();$('library').scrollIntoView({behavior:'smooth',block:'start'})}};
$('questions').onchange=e=>{const q=bank.find(q=>q.id===e.target.dataset.answer);if(q){const value=normalizeAnswer(e.target.value,q.options);if(e.target.value.trim()&&!value){e.target.value=q.answer;return message('Nhập các chữ cái đáp án có trong câu, ví dụ AD hoặc ACE.')}q.answer=value;q.answerSource='manual';q.aiStatus=null;q.verified=false;saveBank()}};
$('questions').onclick=e=>{const toggleBtn=e.target.closest('[data-toggle-text]');if(toggleBtn){const t=toggleBtn.closest('.question-card')?.querySelector('.question-title');if(t)t.classList.toggle('collapsed-text');return}const button=e.target.closest('button');if(!button)return;const id=button.dataset.verify||button.dataset.edit||button.dataset.delete,q=bank.find(q=>q.id===id);if(!q)return;
 if(button.dataset.edit)return editQuestion(q);
 if(button.dataset.verify){if(!q.answer)return message('Chọn đáp án đúng trước khi xác nhận.');q.verified=!q.verified}
 if(button.dataset.delete){if(!confirm('Xóa câu hỏi này khỏi ngân hàng?'))return;bank=bank.filter(q=>q.id!==id)}saveBank();
};
$('verifyPage').onclick=()=>{const qs=filteredQuestions().slice((page-1)*pageSize,page*pageSize).filter(q=>q.answer&&!q.verified);if(!qs.length)return;if(confirm(`Bạn đã kiểm tra nội dung và đáp án của ${qs.length} câu trong trang này? Xác nhận để đưa các câu này vào đề luyện.`)){qs.forEach(q=>q.verified=true);saveBank()}};
const notesButton=document.createElement('button');notesButton.className='secondary';notesButton.textContent='Lấy đáp án từ ghi chú';$('verifyPage').before(notesButton);
let aiRunning=false,aiController=null;
let autoAi=true,autoAiTimer;
try{autoAi=localStorage.getItem('sot-ai-auto')!=='false'}catch{}
const aiPanel=document.createElement('section');aiPanel.className='card ai-panel';aiPanel.setAttribute('aria-label','Bổ sung đáp án bằng AI');
aiPanel.innerHTML='<div><span class="overline">TRỢ LÝ HỌC TẬP</span><h3>Tự động bổ sung đáp án</h3><p>Câu thiếu đáp án được gửi cho Gemini sau khi nhập. Đáp án AI có thể dùng để ôn và được ghi rõ là gợi ý; bạn vẫn có thể sửa hoặc xác nhận.</p></div><label class="check-label"><input id="aiAuto" type="checkbox"> Tự động xử lý câu thiếu đáp án bằng AI</label><div class="ai-actions"><button id="aiStart">✦ Thử lại các câu còn thiếu</button><button id="aiStop" class="secondary" hidden>Dừng xử lý</button><button id="aiAccept" class="secondary" hidden>Xác nhận đề xuất AI</button></div><p id="aiAvailability"></p><div id="aiProgress" role="status" aria-live="polite"></div><progress id="aiBar" max="1" value="0" hidden></progress>';
$('library').insertBefore(aiPanel,$('library').querySelector('.library-toolbar'));
const sourceAi=document.createElement('label');sourceAi.className='check-label source-auto-ai';sourceAi.innerHTML='<input id="sourceAutoAI" type="checkbox"> Tự động gửi ảnh slide của câu thiếu đáp án cho Gemini. Giữ nguyên đáp án trong ghi chú; có thể tắt bất cứ lúc nào.';
$('sourceControls').querySelector('.import-options').after(sourceAi);
function setAutoAi(value){autoAi=value;try{localStorage.setItem('sot-ai-auto',String(value))}catch{}$('aiAuto').checked=value;$('sourceAutoAI').checked=value;if(value)scheduleAutoAi();else{clearTimeout(autoAiTimer);aiController?.abort()}}
$('aiAuto').checked=autoAi;$('sourceAutoAI').checked=autoAi;
$('aiAuto').onchange=e=>setAutoAi(e.target.checked);$('sourceAutoAI').onchange=e=>setAutoAi(e.target.checked);
function scheduleAutoAi(){
 clearTimeout(autoAiTimer);
 autoAiTimer=setTimeout(()=>{
  if(!autoAi||aiRunning||!AI_API_BASE||session&&!session.done)return;
  if(resources.isBusy()){autoAiTimer=setTimeout(scheduleAutoAi,500);return}
  const missing=bank.filter(q=>!q.answer&&hasAiInput(q));if(!missing.length)return;
  try{resources.apiToken()}catch{return}
  const signature=JSON.stringify(missing.map(q=>[q.id,questionAutoKey(q)]));
  try{if(sessionStorage.getItem('sot-ai-auto-attempt')===signature)return;sessionStorage.setItem('sot-ai-auto-attempt',signature)}catch{}
  runAi({automatic:true});
 },250);
}
function questionAutoKey(q){return q.stem+'\n'+q.options.map(o=>o.id+o.text).join('\n')}
function renderAi(){
 const missing=bank.filter(q=>!q.answer).length,proposed=bank.filter(q=>q.answerSource==='gemini'&&q.answer&&!q.verified).length,incomplete=bank.filter(q=>!q.answer&&!hasAiInput(q)).length;
 $('aiStart').disabled=aiRunning||missing===incomplete||!AI_API_BASE;$('aiStart').hidden=aiRunning;$('aiStop').hidden=!aiRunning;
 $('aiAccept').hidden=!proposed;$('aiAccept').disabled=aiRunning;
 $('aiAvailability').textContent=AI_API_BASE?`${missing} câu thiếu đáp án · ${proposed} đáp án AI gợi ý có thể dùng. ${incomplete?`${incomplete} câu chưa có ảnh hoặc nội dung đầy đủ. `:''}Đọc từng ảnh slide gốc; lưu kết quả sau mỗi câu. AI có thể sai.`:'Tính năng AI đang được chuẩn bị. Bạn vẫn có thể lấy đáp án từ ghi chú và ôn luyện bình thường.';
}
$('aiStop').onclick=()=>{setAutoAi(false);$('aiProgress').textContent='Đang dừng. Các đáp án đã lưu vẫn được giữ.'};
$('aiAccept').onclick=()=>{
 if(session&&!session.done)return message('Hoàn thành bài đang làm trước khi cập nhật đáp án.','library');
 const proposed=bank.filter(q=>q.answerSource==='gemini'&&q.answer&&!q.verified);
 if(!proposed.length||!confirm(`Dùng ${proposed.length} đáp án AI đề xuất cho ôn luyện và thi thử? AI có thể sai. Hãy kiểm tra các câu quan trọng trước khi xác nhận.`))return;
 proposed.forEach(q=>q.verified=true);saveBank();message(`Đã cho phép dùng ${proposed.length} đề xuất AI. Nguồn đáp án AI vẫn được ghi rõ.`,'library');
};
async function runAi({automatic=false}={}){
 if(session&&!session.done)return message('Hoàn thành bài đang làm trước khi bổ sung đáp án.','library');
 if(aiRunning||!AI_API_BASE)return;
 let pending=structuredClone(bank.filter(q=>!q.answer));if(!pending.length)return;
 let token;try{token=resources.apiToken()}catch(error){return message(error.message,'library')}
 aiRunning=true;aiController=new AbortController();let done=0,applied=0,uncertain=0,fromNotes=0;renderLibrary();$('aiBar').hidden=false;$('aiBar').max=pending.length;$('aiBar').value=0;
 try{
  {
   $('aiProgress').textContent='Đang kiểm tra ghi chú trước; chỉ gửi câu còn thiếu cho AI…';
   try{
    const result=await resources.readAnswers(pending);
    if(aiController.signal.aborted)throw new DOMException('Stopped','AbortError');
    for(const update of result.updates){const q=bank.find(q=>q.id===update.id),original=pending.find(q=>q.id===update.id);if(q&&!q.answer&&original&&questionAutoKey(q)===questionAutoKey(original)){q.answer=update.answer;q.explanation=update.explanation;q.verified=true;q.answerSource='speaker-notes';fromNotes++}}
   }catch(error){if(error.name==='AbortError')throw error;}
   if(fromNotes&&!write('sot-bank',bank))throw Error('Không lưu được đáp án từ ghi chú.');
   pending=pending.filter(q=>{const current=bank.find(current=>current.id===q.id);return current&&!current.answer});refreshStats();renderLibrary();$('aiBar').max=pending.length||1;
   if(!pending.length){$('aiProgress').textContent=`Đã lấy ${fromNotes} đáp án từ ghi chú; không cần gọi AI.`;return}
  }
  const incomplete=pending.filter(q=>!hasAiInput(q)).length;pending=pending.filter(hasAiInput);
  if(!pending.length){$('aiProgress').textContent='Chưa đọc được đầy đủ lựa chọn. Hãy đối chiếu ảnh hoặc sửa đề; không gửi dữ liệu thiếu cho AI.';return}
  $('aiBar').max=pending.length;
  while(done<pending.length){
   if(aiController.signal.aborted)throw new DOMException('Stopped','AbortError');
   const batch=pending.slice(done,done+1).filter(q=>{const current=bank.find(current=>current.id===q.id);return current&&!current.answer});
   $('aiProgress').textContent=`Đang xử lý ${done+1}–${Math.min(done+1,pending.length)} / ${pending.length} câu…`;
   if(batch.length){
    for(const q of batch){if(q.url){const blob=await resources.slideBlob(q);if(aiController.signal.aborted)throw new DOMException('Stopped','AbortError');if(blob.size>2100000)throw Error('Slide image exceeds 2 MB.');q.image={mimeType:blob.type,data:await blobToBase64(blob)}}}
    const result=await solveBatch(AI_API_BASE,batch,resources.apiToken(),{signal:aiController.signal});
    const counts=applyAiResults(bank,batch,result.answers,result.model);applied+=counts.applied;uncertain+=counts.uncertain;
    if(!write('sot-bank',bank))throw Error('Không lưu được kết quả. Hãy xuất ngân hàng và kiểm tra dung lượng trình duyệt trước khi tiếp tục.');
   }
   done=Math.min(done+1,pending.length);$('aiBar').value=done;refreshStats();renderLibrary();
  }
  $('aiProgress').textContent=`Đã lấy ${fromNotes} đáp án từ ghi chú và lưu ${applied} đáp án AI gợi ý, có thể ôn luyện ngay. ${uncertain} câu AI chưa xác định được vẫn để trống.${incomplete?` ${incomplete} câu thiếu lựa chọn chưa gửi AI.`:''}`;
 }catch(error){$('aiProgress').textContent=error.name==='AbortError'?`Đã dừng và giữ ${applied} đề xuất. Bấm AI bổ sung đáp án để tiếp tục các câu còn thiếu.`:`${error.message} Đã giữ ${applied} đề xuất; có thể tiếp tục sau.`}
 finally{aiRunning=false;aiController=null;renderLibrary()}
}
$('aiStart').onclick=()=>runAi();
notesButton.onclick=async()=>{
 if(aiRunning)return message('Dừng AI trước khi đọc lại ghi chú.','library');
 if(session&&!session.done)return message('Hoàn thành bài đang làm trước khi cập nhật đáp án.');
 const snapshot=bank;notesButton.disabled=true;notesButton.textContent='Đang đọc ghi chú…';
 try{
  const {updates,failures,unresolved}=await resources.readAnswers(snapshot);
  if(bank!==snapshot||session&&!session.done)return message('Ngân hàng hoặc bài làm đã thay đổi. Hãy lấy lại đáp án.');
  for(const update of updates){const q=bank.find(q=>q.id===update.id);if(q&&(!q.verified||q.answer===update.answer)){q.answer=update.answer;q.explanation=update.explanation;q.verified=true;q.answerSource='speaker-notes'}}
  const details=[['missingSlide','Không khớp slide gốc'],['empty','Google chưa trả nội dung ghi chú'],['unmatched','Ghi chú chưa khớp lựa chọn đáp án']].filter(([key])=>unresolved[key].length).map(([key,label])=>`${label}: ${unresolved[key].length} câu (slide ${unresolved[key].slice(0,10).join(', ')}${unresolved[key].length>10?', …':''}).`).join(' ');
  saveBank();message(`${updates.length?`Đã cập nhật đáp án/giải thích cho ${updates.length} câu từ ghi chú.`:'Không tìm thấy đáp án mới hoặc giải thích cần bổ sung trong ghi chú.'} Hiện có ${bank.filter(readyForPractice).length}/${bank.length} câu sẵn sàng ôn luyện. Không quét lại ảnh. ${details}${failures.length?' Một số tài liệu không đọc được: '+failures.join('; '):''}`);
 }catch(error){message(error.message)}finally{notesButton.disabled=false;notesButton.textContent='Lấy đáp án từ ghi chú';scheduleAutoAi()}
};
$('clear').onclick=()=>{if(confirm('Xóa ngân hàng câu hỏi trên thiết bị này? Lịch sử bài làm vẫn được giữ.')){bank=[];sourceSummary='';write('sot-source','');saveBank()}};
function editQuestion(q){editing=q.id;$('editFields').innerHTML=`<label>Nội dung câu hỏi (nguyên cụm)<textarea name="stem" rows="7" required>${esc(displayContent(q))}</textarea></label><label>Đáp án đúng<input name="answer" value="${esc(q.answer)}" placeholder="A, AD, ACE…" maxlength="24" autocomplete="off"></label><label>Giải thích (tùy chọn)<textarea name="explanation" rows="3">${esc(q.explanation||'')}</textarea></label>`;$('editQuestion').showModal()}
for(const id of ['closeEdit','cancelEdit'])$(id).onclick=()=>$('editQuestion').close();
$('editForm').onsubmit=e=>{e.preventDefault();const q=bank.find(q=>q.id===editing);if(!q)return;const fields=new FormData(e.target),stem=String(fields.get('stem')||'').trim(),explanation=String(fields.get('explanation')||'').trim();if(!stem)return message('Nội dung câu hỏi không được để trống.');let updated;try{updated=updateQuestionContent(q,stem)}catch(error){return message(error.message)}const correct=normalizeAnswer(fields.get('answer'),updated.options);if(String(fields.get('answer')).trim()&&!correct)return message('Đáp án phải là các chữ cái hợp lệ, ví dụ AD hoặc ACE.');Object.assign(q,updated);q.explanation=explanation;q.answer=correct;q.answerSource='manual';q.aiStatus=null;q.verified=false;saveBank();$('editQuestion').close()};

$('exportBank').onclick=()=>{if(!bank.length)return;const data={format:'slide-on-thi/v1',exportedAt:new Date().toISOString(),questions:bank.map(({id,stem,content,options,answer,verified,sourceId,sourceName,slide,url,extraction,explanation,answerSource,aiStatus,aiReason,aiModel})=>({id,stem,content,options,answer,verified,sourceId,sourceName,slide,url,extraction,explanation,answerSource,aiStatus,aiReason,aiModel}))};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='slide-on-thi-ngan-hang.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
for(const id of ['importBank'])$(id).onclick=()=>$('bankFile').click();
$('bankFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(aiRunning)throw Error('Dừng AI trước khi thay ngân hàng.');if(session&&!session.done)throw Error('Hãy hoàn thành bài đang làm trước khi nhập bộ câu hỏi.');if(file.size>10*1024*1024)throw Error('File lớn hơn 10 MB.');const imported=validateBank(JSON.parse(await file.text()));if(bank.length&&!confirm(`Thay ngân hàng hiện tại bằng ${imported.length} câu từ file này?`))return;if(!write('sot-bank',imported))return;bank=imported;sourceSummary=sources().map(([,name])=>name).join(' · ');write('sot-source',sourceSummary);lastResult=null;page=1;switchView('library');message(`Đã nhập ${bank.length} câu từ bộ đã lưu. Không cần đọc lại ảnh; hãy kiểm tra nguồn và đáp án trước khi dùng.`)}catch(error){message(error instanceof SyntaxError?'File JSON không đọc được. Hãy dùng file xuất từ Slide Ôn Thi.':error.message)}finally{e.target.value=''}};

function renderPractice(){
 if(session&&!session.done)return renderQuiz();
 const eligible=bank.filter(readyForPractice),n=eligible.length;
 $('practice').innerHTML=`<div class="mode-layout"><div class="card"><span class="overline">THIẾT LẬP BUỔI HỌC</span><h2>Chọn chế độ phù hợp với bạn</h2><fieldset class="mode-picker"><legend>Hôm nay bạn muốn…</legend><label class="mode-choice"><input type="radio" name="mode" value="study" ${preferredMode==='study'?'checked':''}><span><b>◉ Ôn luyện</b><small>Chọn đáp án và biết đúng sai ngay. Không giới hạn thời gian.</small></span></label><label class="mode-choice"><input type="radio" name="mode" value="exam" ${preferredMode==='exam'?'checked':''}><span><b>◷ Thi thử</b><small>Đếm ngược, tự nộp khi hết giờ. Chấm điểm sau khi nộp bài.</small></span></label></fieldset><label>Nguồn câu hỏi<select id="practiceSource"><option value="">Tất cả tài liệu (${n} câu sẵn sàng)</option>${sources().map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('')}</select></label><p class="pool-availability"><strong id="poolCount">${n}</strong> câu có đáp án để ôn luyện (gồm đáp án AI gợi ý).</p><div class="setup-fields"><label>Số câu<input id="count" type="number" min="1" max="${n}" value="${Math.min(20,n)||1}"></label><label id="timeSetting" ${preferredMode==='study'?'hidden':''}>Thời gian (phút)<input id="minutes" type="number" min="1" max="180" value="20"></label></div><button id="start" class="wide-button" ${!n?'disabled':''}>${preferredMode==='study'?'Bắt đầu ôn luyện':'Bắt đầu thi thử'} →</button>${!n?'<p>Chưa có câu hỏi có đáp án. <a href="#" data-view="library">Kiểm tra ngân hàng câu hỏi →</a></p>':''}</div></div>`;
 const pool=()=>eligible.filter(q=>!$('practiceSource').value||q.sourceId===$('practiceSource').value);
 $('practiceSource').onchange=()=>{const count=pool().length;$('poolCount').textContent=count;$('count').max=count;$('count').value=Math.min(20,count)||1;$('start').disabled=!count};
 document.querySelectorAll('[name=mode]').forEach(input=>input.onchange=()=>{preferredMode=input.value;$('timeSetting').hidden=preferredMode==='study';$('start').textContent=(preferredMode==='study'?'Bắt đầu ôn luyện':'Bắt đầu thi thử')+' →'});
 $('start').onclick=()=>{const questions=pool(),count=Number($('count').value),mins=Number($('minutes').value);if(!Number.isInteger(count)||count<1||count>questions.length||(preferredMode==='exam'&&(!Number.isInteger(mins)||mins<1||mins>180)))return message('Kiểm tra lại số câu và thời gian.');session={mode:preferredMode,questions:shuffle(questions).slice(0,count).map(q=>({...q,options:[...q.options]})),answers:{},flags:[],current:0,started:Date.now(),deadline:preferredMode==='exam'?Date.now()+mins*60000:null,done:false};write('sot-session',session);message('');renderQuiz();for(let i=0;i<Math.min(5,session.questions.length);i++)slideImages.get(session.questions[i]).catch(()=>{});};
}
function noteExplanation(q){return q.explanation?`<div class="note-explanation"><b>${q.answerSource==='gemini'?'Giải thích AI · cần kiểm tra':'Giải thích từ ghi chú'}</b><p>${esc(q.explanation)}</p></div>`:""}
async function loadQuizSlideImage(q){const container=document.querySelector('.slide-media-container[data-slide-q="'+CSS.escape(q.id)+'"]');await showQuestionImage(container,q)}
function renderQuiz(){
 const study=session.mode==='study',qs=session.questions;session.current=Math.max(0,Math.min(session.current||0,qs.length-1));const q=qs[session.current],answered=session.answers[q.id],multiple=q.answer.length>1;
 document.body.classList.toggle('exam-active',!study);pageHeading.hidden=true;
 $('practice').innerHTML=`<div class="quiz-head"><div><span class="overline">${study?'ÔN LUYỆN':'THI THỬ'} · ${qs.length} CÂU HỎI</span><h2>${study?'Ôn luyện':'Thi thử'}</h2><small id="progress"></small></div><div class="quiz-clock"><small>${study?'Thời gian đã học':'Thời gian còn lại'}</small><div class="timer" id="timer"></div></div><button id="submit">${study?'Kết thúc buổi học':'Nộp bài'} ↗</button></div><div class="quiz-layout"><div><article class="card quiz-question"><div class="question-top"><span>CÂU ${session.current+1} / ${qs.length}</span><label class="check-label"><input type="checkbox" id="flagCurrent" ${session.flags.includes(q.id)?'checked':''}> Đánh dấu xem lại</label></div>${sourceReference(q,true)}${aiBadge(q)}${multiple?'<p class="multi-hint">Chọn tất cả đáp án đúng.'+(study?' Bấm Kiểm tra sau khi chọn xong.':' Có thể thay đổi lựa chọn trước khi nộp bài.')+'</p>':''}<div class="slide-media-container" data-slide-q="${esc(q.id)}"></div><div class="question-title ${q.url?'collapsed-text':''}">${esc(displayContent(q))}</div><div class="choice-pills">${q.options.map((o,i)=>`<button class="choice-pill ${optionState(session,q,o.id)}" data-q="${esc(q.id)}" data-o="${o.id}" aria-pressed="${(answered||session.drafts?.[q.id]||'').includes(o.id)}" ${study&&answered?'disabled':''}>${esc(o.id)}</button>`).join('')}</div>${q.extraction==='ocr'?`<button class="secondary source-image-check" data-preview-slide="${esc(q.id)}">Phóng to ảnh gốc 🔍</button>`:''}${study&&multiple&&!answered?`<button id="checkMultiple" class="multi-check" ${!session.drafts?.[q.id]?'disabled':''}>Kiểm tra đáp án</button>`:''}${study&&answered?`<div class="feedback ${isCorrect(q,answered)?'right':'incorrect'}" role="status">${isCorrect(q,answered)?'✓ Chính xác. Bạn đã nắm được câu này!':'✕ Chưa đúng. Cùng ghi nhớ đáp án nhé.'}<br>Đáp án đúng: <strong>${esc(q.answer)}</strong>${noteExplanation(q)}</div>`:''}</article><div class="quiz-controls"><button class="secondary" data-index="${session.current-1}" ${!session.current?'disabled':''}>← Câu trước</button><button data-index="${session.current+1}" ${session.current===qs.length-1?'disabled':''}>Câu tiếp theo →</button></div></div><aside class="card"><h3>Danh sách câu hỏi</h3><p>${study?'Câu một đáp án chấm ngay; câu nhiều đáp án chấm khi bấm Kiểm tra.':'Bạn có thể quay lại và thay đổi đáp án.'}</p><div class="quiz-navigation">${qs.map((item,i)=>`<button data-index="${i}" class="${session.current===i?'current ':''}${session.answers[item.id]?'answered ':''}${session.flags.includes(item.id)?'flagged':''}" aria-label="Đến câu ${i+1}" ${session.current===i?'aria-current="step"':''}>${i+1}</button>`).join('')}</div><div class="quiz-legend"><span>■</span> Đã trả lời &nbsp; □ Chưa trả lời<br><span style="color:#e2bb7a">━</span> Đánh dấu xem lại</div></aside></div>`;
 if($('checkMultiple'))$('checkMultiple').onclick=()=>{if(confirmQuestion(session,q.id)){write('sot-session',session);renderQuiz()}};
 $('flagCurrent').onchange=e=>{session.flags=e.target.checked?[...new Set([...session.flags,q.id])]:session.flags.filter(id=>id!==q.id);write('sot-session',session);switchView('practice')};
 $('submit').onclick=()=>{if(confirm(`${study?'Kết thúc buổi học':'Nộp bài thi'}? Bạn đã trả lời ${Object.keys(session.answers).length}/${qs.length} câu.`))finish()};updateTimer();
 setTimeout(()=>{
  loadQuizSlideImage(q);
  for(let offset=1;offset<=3;offset++){
   const nextQ=qs[session.current+offset];
   if(nextQ)slideImages.get(nextQ).catch(()=>{});
  }
 },0);
}
$('practice').onclick=e=>{const toggleBtn=e.target.closest('[data-toggle-text]');if(toggleBtn){const t=toggleBtn.closest('.quiz-question')?.querySelector('.question-title');if(t)t.classList.toggle('collapsed-text');return}const indexButton=e.target.closest('[data-index]');if(indexButton&&session&&!session.done){if(session.mode!=='study'&&Date.now()>=session.deadline)return finish();session.current=Number(indexButton.dataset.index);write('sot-session',session);renderQuiz();return}const answer=e.target.closest('[data-q]');if(answer&&session&&!session.done){if(answerQuestion(session,answer.dataset.q,answer.dataset.o)){write('sot-session',session);renderQuiz()}else updateTimer()}};
function updateTimer(){if(!session||session.done)return;const study=session.mode==='study',seconds=study?Math.max(0,Math.floor((Date.now()-session.started)/1000)):Math.max(0,Math.ceil((session.deadline-Date.now())/1000));if($('timer'))$('timer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;if($('progress'))$('progress').textContent=`${Object.keys(session.answers).length}/${session.questions.length} câu đã trả lời${study?' · Đúng '+grade(session.questions,session.answers)+' câu':''}`;if(!study&&!seconds)finish()}
function finish(){if(!session||session.done)return;session.done=true;lastResult={...session,id:crypto.randomUUID(),finished:Date.now(),correct:grade(session.questions,session.answers)};history.unshift(lastResult);history=history.slice(0,50);write('sot-history',history);write('sot-session',null);session=null;resultFilter='all';switchView('result');message('Đã lưu kết quả buổi học trên thiết bị này.')}
function renderResult(r){
 const total=r.questions.length,wrong=r.questions.filter(q=>r.answers[q.id]&&!isCorrect(q,r.answers[q.id])).length,unanswered=r.questions.filter(q=>!r.answers[q.id]).length;
 const elapsed=Math.max(0,Math.ceil(((r.mode==='study'?r.finished:Math.min(r.finished,r.deadline))-r.started)/60000));
 const visible=r.questions.filter(q=>resultFilter==='all'||(resultFilter==='wrong'?!isCorrect(q,r.answers[q.id]):!r.answers[q.id]));
 $('result').innerHTML=`<div class="card result-overview"><div class="score-ring" style="--score:${r.correct/total*100}%"><div><strong class="score-number">${(r.correct/total*10).toFixed(1)}</strong><small>TRÊN 10 ĐIỂM</small></div></div><div class="result-details"><span class="overline">${r.mode==='study'?'ÔN LUYỆN':'THI THỬ'} · ĐÃ HOÀN THÀNH</span><h2>${r.correct}/${total} câu trả lời đúng</h2><p>${elapsed} phút học tập · ${new Date(r.finished).toLocaleString('vi-VN')}</p><div class="result-breakdown"><div class="correct-stat">Trả lời đúng<strong>${r.correct}</strong></div><div class="wrong-stat">Trả lời sai<strong>${wrong}</strong></div><div>Chưa trả lời<strong>${unanswered}</strong></div></div><div class="row"><button id="again">Tạo đề mới →</button><button id="retry" class="secondary" ${r.correct===total?'disabled':''}>Luyện lại câu sai</button><button data-view="history" class="text-button">Xem lịch sử ↗</button></div></div></div><div class="section-heading"><div><span class="overline">HIỂU LẠI TỪNG CÂU</span><h2>Xem lại bài làm</h2></div></div><div class="result-filters">${[['all','Tất cả ('+total+')'],['wrong','Cần ôn lại ('+(wrong+unanswered)+')'],['unanswered','Chưa trả lời ('+unanswered+')']].map(([id,label])=>`<button class="secondary ${resultFilter===id?'active':''}" data-result-filter="${id}">${label}</button>`).join('')}</div>${visible.length?visible.map(q=>`<article class="card question-card"><div class="question-top"><span>CÂU ${r.questions.indexOf(q)+1}</span><span class="tag ${isCorrect(q,r.answers[q.id])?'ok':''}">${isCorrect(q,r.answers[q.id])?'✓ Đúng':r.answers[q.id]?'Sai':'Chưa trả lời'}</span></div>${sourceReference(q)}${aiBadge(q)}<div class="library-slide-media" data-lib-slide="${esc(q.id)}"></div><div class="question-title ${q.url?'collapsed-text':''}">${esc(displayContent(q))}</div><div class="choice-pills choice-pills-result">${q.options.map((o,i)=>`<div class="choice-pill ${q.answer.includes(o.id)?'correct':(r.answers[q.id]||'').includes(o.id)?'wrong':''}">${esc(o.id)}</div>`).join('')}</div><div class="result-answer-row"><span>Đáp án đúng: <strong class="badge-answer ok">${esc(q.answer)}</strong></span><span>Bạn chọn: <strong class="badge-answer ${isCorrect(q,r.answers[q.id])?'ok':r.answers[q.id]?'danger':'muted'}">${esc(r.answers[q.id]||'Chưa trả lời')}</strong></span></div>${noteExplanation(q)}</article>`).join(''):empty('Không có câu hỏi trong nhóm này','Thử chọn Tất cả để xem toàn bộ bài làm.','history','Về lịch sử →')}`;
 setTimeout(()=>loadLibrarySlideImages(visible),0);
 $('again').onclick=()=>{lastResult=null;switchView('practice')};$('retry').onclick=()=>{const qs=r.questions.filter(q=>!isCorrect(q,r.answers[q.id]));if(!qs.length)return;session={mode:'study',questions:shuffle(qs),answers:{},flags:[],current:0,started:Date.now(),deadline:null,done:false};write('sot-session',session);switchView('practice')};
 document.querySelectorAll('[data-result-filter]').forEach(button=>button.onclick=()=>{resultFilter=button.dataset.resultFilter;renderResult(r)});
}
function renderHistory(){
 const average=history.length?history.reduce((sum,r)=>sum+r.correct/r.questions.length*10,0)/history.length:0;
 $('history').innerHTML=`<div class="section-heading"><div><span class="overline">HÀNH TRÌNH CỦA BẠN</span><h2>${history.length} bài đã hoàn thành</h2><p>${history.length?`Điểm trung bình ${average.toFixed(1)}/10 · Lưu tối đa 50 bài gần nhất trên thiết bị này.`:'Những bài bạn hoàn thành sẽ được lưu tại đây.'}</p></div><button data-view="practice">Luyện một đề mới →</button></div>`+(history.length?`<div class="history-list">${history.map(r=>`<article class="card history-item"><div class="history-score">${(r.correct/r.questions.length*10).toFixed(1)}</div><div class="history-info"><span class="tag ${r.mode==='study'?'ok':''}">${r.mode==='study'?'ÔN LUYỆN':'THI THỬ'}</span><h3>Đúng ${r.correct}/${r.questions.length} câu hỏi</h3><p>${new Date(r.finished).toLocaleString('vi-VN')}</p></div><button class="secondary" data-result="${esc(r.id)}">Xem bài làm ↗</button></article>`).join('')}</div>`:empty('Buổi học đầu tiên đang chờ bạn','Hãy bắt đầu với một đề ngắn. Kết quả sẽ giúp bạn biết mình đã vững phần nào.','practice','Bắt đầu luyện tập →'));
}
$('history').onclick=e=>{const id=e.target.closest('[data-result]')?.dataset.result;if(!id)return;if(session&&!session.done)return message('Hoàn thành bài đang làm trước khi mở kết quả khác.');lastResult=history.find(r=>r.id===id);resultFilter='all';switchView('result')};
let theme=localStorage.getItem('sot-theme')||'light';document.documentElement.dataset.theme=theme;$('themeToggle').textContent=theme==='dark'?'☀':'☾';$('themeToggle').onclick=()=>{theme=theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;localStorage.setItem('sot-theme',theme);$('themeToggle').textContent=theme==='dark'?'☀':'☾'};
for(const [key,value] of [['sot-bank',bank],['sot-history',history],['sot-session',session]])if(originalStorage.get(key)!==JSON.stringify(value))write(key,value);
setTimeout(scheduleAutoAi,0);setInterval(updateTimer,1000);document.addEventListener('visibilitychange',updateTimer);refreshStats();switchView(session&&!session.done?'practice':view);
