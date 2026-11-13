export function fitQuizScreen({root,session,question,isCorrect,navItemClass,sound}){
 document.body.classList.add('quiz-active');window.scrollTo(0,0);
 const study=session.mode==='study',head=root.querySelector('.quiz-head'),card=root.querySelector('.quiz-question'),aside=root.querySelector('.quiz-layout>aside');
 head.querySelector('.overline').textContent=study?'ÔN LUYỆN':'THI THỬ';head.querySelector('#submit').textContent=study?'Kết thúc':'Nộp bài';
 if(study){const back=document.createElement('button');back.type='button';back.className='secondary quiz-leave';back.dataset.view='library';back.textContent='← Thư viện';back.title='Tạm rời, bài ôn luyện vẫn được giữ';head.prepend(back)}
 const group=card.querySelector('.quiz-nav-group'),counter=group?.querySelector('.question-counter');if(group&&counter)group.replaceWith(counter);
 const multi=card.querySelector('.multi-hint');if(multi)multi.textContent=study?'Chọn các đáp án, rồi bấm Kiểm tra.':'Chọn tất cả đáp án đúng.';
 const controls=root.querySelector('.quiz-controls');controls.children[0].textContent='← Trước';controls.children[1].textContent='Tiếp →';
 const mapButton=document.createElement('button');mapButton.type='button';mapButton.className='secondary quiz-map-open';mapButton.textContent='Câu hỏi';controls.insertBefore(mapButton,controls.children[1]);
 if(study&&sound){const button=document.createElement('button');button.type='button';button.className='secondary quiz-sound-toggle';const update=()=>{button.textContent=sound.enabled?'♪':'⊘';button.setAttribute('aria-pressed',String(sound.enabled));button.title=button.ariaLabel=sound.enabled?'Tắt âm báo đúng/sai':'Bật âm báo đúng/sai'};button.onclick=()=>{sound.toggle();update()};update();controls.insertBefore(button,controls.lastElementChild)}
 function paginateMap(container){
  const grid=container.querySelector('.quiz-navigation'),size=innerHeight<440?5:innerHeight<700?10:20,total=session.questions.length,pages=Math.ceil(total/size);let page=Math.floor(session.current/size);
  const pager=document.createElement('div');pager.className='quiz-map-pager';const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');prev.className=next.className='secondary';prev.type=next.type='button';prev.textContent='←';next.textContent='→';prev.setAttribute('aria-label','Trang câu hỏi trước');next.setAttribute('aria-label','Trang câu hỏi tiếp');pager.append(prev,label,next);grid.after(pager);
  function render(){grid.replaceChildren(...session.questions.slice(page*size,(page+1)*size).map((q,j)=>{const index=page*size+j,button=document.createElement('button');button.type='button';button.dataset.index=index;button.className=navItemClass(session,q,index,study);button.textContent=index+1;button.setAttribute('aria-label','Đến câu '+(index+1));if(index===session.current)button.setAttribute('aria-current','step');return button}));label.textContent=`${page*size+1}–${Math.min(total,(page+1)*size)} / ${total}`;prev.disabled=page===0;next.disabled=page===pages-1}
  prev.onclick=()=>{page--;render()};next.onclick=()=>{page++;render()};render();
 }
 aside.classList.add('quiz-map-card');aside.querySelector('p').textContent='Chọn số để chuyển câu.';paginateMap(aside);
 const mapDialog=document.createElement('dialog');mapDialog.className='quiz-map-dialog';mapDialog.setAttribute('aria-label','Danh sách câu hỏi');
 mapDialog.innerHTML='<div class="modal-heading"><h2>Danh sách câu hỏi</h2><button type="button" class="secondary">Đóng</button></div>';
 mapDialog.querySelector('button').onclick=()=>mapDialog.close();root.append(mapDialog);
 mapButton.onclick=()=>{mapDialog.querySelector('.quiz-map-card')?.remove();const copy=aside.cloneNode(true);copy.querySelector('.quiz-map-pager').remove();copy.querySelector('h3').remove();paginateMap(copy);mapDialog.append(copy);mapDialog.showModal()};
 const feedback=card.querySelector('.feedback');
 if(feedback){
  feedback.replaceChildren();
  const mainRow=document.createElement('div');mainRow.className='feedback-main-row';
  const result=document.createElement('strong');result.textContent=(isCorrect(question,session.answers[question.id])?'✓ Đúng':'✕ Chưa đúng')+' · Đáp án: '+question.answer;
  mainRow.append(result);
  if(question.explanation){
   const button=document.createElement('button');button.type='button';button.className='text-button feedback-toggle-btn';button.textContent='Xem giải thích';
   const expBox=document.createElement('div');expBox.className='feedback-inline-exp';expBox.hidden=true;
   const expTitle=document.createElement('b');expTitle.textContent=question.answerSource==='gemini'?'Giải thích AI:':'Ghi chú / Giải thích:';
   const expText=document.createElement('span');expText.textContent=question.explanation;
   expBox.append(expTitle,expText);
   button.onclick=()=>{
    const show=expBox.hidden;
    expBox.hidden=!show;
    button.textContent=show?'Ẩn giải thích':'Xem giải thích';
   };
   mainRow.append(button);
   feedback.append(mainRow,expBox);
  }else{
   feedback.append(mainRow);
  }
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
