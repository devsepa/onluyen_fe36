export function fitQuizScreen({root,session,question,isCorrect,navItemClass,sound,autoAdvance,onAutoAdvance,prefetchEnabled,onPrefetchChange}){
 document.body.classList.add('quiz-active');
 const study=session.mode==='study',head=root.querySelector('.quiz-head'),card=root.querySelector('.quiz-question'),layout=root.querySelector('.quiz-layout'),aside=layout?.querySelector('aside');
 head.querySelector('.overline').textContent=study?'ÔN LUYỆN':'THI THỬ';
 head.querySelector('#submit').textContent=study?'Kết thúc':'Nộp bài';
 if(study&&!head.querySelector('.quiz-leave')){
  const back=document.createElement('button');back.type='button';back.className='secondary quiz-leave';back.dataset.view='library';back.textContent='← Thư viện';back.title='Tạm rời, bài ôn luyện vẫn được giữ';
  head.prepend(back);
 }

 const multi=card.querySelector('.multi-hint');
 if(multi)multi.textContent=study?'Chọn các đáp án, rồi bấm Kiểm tra.':'Chọn tất cả đáp án đúng.';
 if(study&&!head.querySelector('.study-auto-toggle')){
  const label=document.createElement('label');label.className='study-auto-toggle';
  const input=document.createElement('input');input.type='checkbox';input.checked=autoAdvance;input.onchange=()=>onAutoAdvance(input.checked);
  label.append(input,'Tự chuyển · 5 giây');head.append(label);
 }

 function paginateMap(container,onSelect){
  const grid=container.querySelector('.quiz-navigation');
  if(!grid)return;
  const size=100,total=session.questions.length,pages=Math.ceil(total/size);let page=Math.floor(session.current/size);
  if(total>20){grid.classList.add('quiz-navigation-dense');}
  const pager=document.createElement('div');pager.className='quiz-map-pager';
  const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');
  prev.className=next.className='secondary';prev.type=next.type='button';prev.textContent='←';next.textContent='→';
  prev.setAttribute('aria-label','Trang câu hỏi trước');next.setAttribute('aria-label','Trang câu hỏi tiếp');
  pager.append(prev,label,next);grid.after(pager);

  function render(){
   grid.replaceChildren(...session.questions.slice(page*size,(page+1)*size).map((q,j)=>{
    const index=page*size+j,button=document.createElement('button');
    button.type='button';button.dataset.index=index;button.className=navItemClass(session,q,index,study);
    button.textContent=index+1;button.setAttribute('aria-label','Đến câu '+(index+1));
    if(index===session.current)button.setAttribute('aria-current','step');
    if(onSelect)button.addEventListener('click',()=>onSelect(index));
    return button;
   }));
   label.textContent=`${page*size+1}–${Math.min(total,(page+1)*size)} / ${total}`;
   prev.disabled=page===0;next.disabled=page===pages-1;
  }
  prev.onclick=()=>{page--;render()};next.onclick=()=>{page++;render()};render();
 }

 if(aside){
  aside.classList.add('quiz-map-card');
  const p=aside.querySelector('p');if(p)p.textContent='Chọn số để chuyển câu.';
  paginateMap(aside);
  if(study){const label=document.createElement('label');label.className='check-label study-prefetch-toggle';const input=document.createElement('input');input.type='checkbox';input.checked=prefetchEnabled;input.onchange=()=>onPrefetchChange(input.checked);label.append(input,'Chuẩn bị trước giải thích AI');aside.append(label)}
 }

 function openMapDialog(){
  root.querySelector('.quiz-map-dialog')?.remove();
  const dialog=document.createElement('dialog');dialog.className='quiz-map-dialog';
  dialog.innerHTML=`<div class="modal-heading"><h2>Danh sách câu hỏi (${session.questions.length} câu)</h2><button type="button" class="secondary close-map-btn" autofocus>Đóng ✕</button></div><div class="quiz-map-card"><p>Chọn số để chuyển câu.</p><div class="quiz-navigation"></div><div class="quiz-legend-custom">${aside?.querySelector('.quiz-legend-custom')?.innerHTML||''}</div></div>`;
  dialog.querySelector('.close-map-btn').onclick=()=>dialog.close();
  paginateMap(dialog.querySelector('.quiz-map-card'),()=>dialog.close());
  if(study){const label=document.createElement('label');label.className='check-label study-prefetch-toggle';const input=document.createElement('input');input.type='checkbox';input.checked=prefetchEnabled;input.onchange=()=>onPrefetchChange(input.checked);label.append(input,'Chuẩn bị trước giải thích AI');dialog.append(label)}
  if(study){const label=document.createElement('label');label.className='check-label study-prefetch-toggle';const input=document.createElement('input');input.type='checkbox';input.checked=head.querySelector('.study-auto-toggle input')?.checked;input.onchange=()=>{const original=head.querySelector('.study-auto-toggle input');original.checked=input.checked;onAutoAdvance(input.checked)};label.append(input,'Tự chuyển sau 5 giây');dialog.append(label)}
  root.append(dialog);
  dialog.showModal();
 }

 const toggleBtn=head.querySelector('#toggleMapBtn');
 if(toggleBtn){
  const isSavedCollapsed=localStorage.getItem('sot-quiz-map-collapsed')==='1';
  if(window.innerWidth>860&&isSavedCollapsed&&layout){layout.classList.add('quiz-map-collapsed');}
  toggleBtn.onclick=()=>{
   if(window.innerWidth<=860){
    openMapDialog();
   }else if(layout){
    const isCollapsed=layout.classList.toggle('quiz-map-collapsed');
    localStorage.setItem('sot-quiz-map-collapsed',isCollapsed?'1':'0');
   }
  };
 }

 if(!question.url&&!question.sharedDeck){card.querySelector('.slide-media-container')?.remove();const text=card.querySelector('.question-title'),button=document.createElement('button');button.type='button';button.className='text-button quiz-read-text';button.textContent='Đọc toàn bộ nội dung';button.onclick=()=>openPagedText(root,'Nội dung câu hỏi',text.textContent);text.after(button)}
}
function openPagedText(root,title,text){
 root.querySelector('.quiz-copy-dialog')?.remove();const dialog=document.createElement('dialog');dialog.className='quiz-copy-dialog';dialog.setAttribute('aria-label',title);
 dialog.innerHTML='<div class="modal-heading"><h2></h2><button type="button" class="secondary">Đóng</button></div><div class="quiz-copy-content"></div><div class="quiz-copy-pager"><button type="button" class="secondary">← Trước</button><span></span><button type="button">Tiếp →</button></div>';
 dialog.querySelector('h2').textContent=title;dialog.querySelector('.modal-heading button').onclick=()=>dialog.close();root.append(dialog);dialog.showModal();
 const content=dialog.querySelector('.quiz-copy-content'),characters=Array.from(text),pages=[];let offset=0,page=0;
 while(offset<characters.length){let low=1,high=characters.length-offset,best=1;while(low<=high){const mid=Math.floor((low+high)/2);content.textContent=characters.slice(offset,offset+mid).join('');if(content.scrollHeight<=content.clientHeight){best=mid;low=mid+1}else high=mid-1}const chunk=characters.slice(offset,offset+best).join('');pages.push(chunk);offset+=best}
 if(!pages.length)pages.push('Chưa có giải thích.');const buttons=dialog.querySelectorAll('.quiz-copy-pager button'),label=dialog.querySelector('.quiz-copy-pager span');function render(){content.textContent=pages[page];label.textContent=`${page+1} / ${pages.length}`;buttons[0].disabled=!page;buttons[1].disabled=page===pages.length-1}buttons[0].onclick=()=>{page--;render()};buttons[1].onclick=()=>{page++;render()};render();
}
