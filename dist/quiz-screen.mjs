export function fitQuizScreen({root,session,question,isCorrect,navItemClass,sound,autoAdvance,onAutoAdvance}){
 document.body.classList.add('quiz-active');window.scrollTo(0,0);
 const study=session.mode==='study',head=root.querySelector('.quiz-head'),card=root.querySelector('.quiz-question'),aside=root.querySelector('.quiz-layout>aside');
 head.querySelector('.overline').textContent=study?'ÔN LUYỆN':'THI THỬ';head.querySelector('#submit').textContent=study?'Kết thúc':'Nộp bài';
 if(study){const back=document.createElement('button');back.type='button';back.className='secondary quiz-leave';back.dataset.view='library';back.textContent='← Thư viện';back.title='Tạm rời, bài ôn luyện vẫn được giữ';head.prepend(back)}

 const multi=card.querySelector('.multi-hint');if(multi)multi.textContent=study?'Chọn các đáp án, rồi bấm Kiểm tra.':'Chọn tất cả đáp án đúng.';
 if(study){const label=document.createElement('label');label.className='study-auto-toggle';const input=document.createElement('input');input.type='checkbox';input.checked=autoAdvance;input.onchange=()=>onAutoAdvance(input.checked);label.append(input,'Tự chuyển · 5 giây');head.append(label)}
 const controls=root.querySelector('.quiz-controls');if(controls&&controls.children.length>=2){controls.children[0].textContent='← Trước';controls.children[1].textContent='Tiếp →'}
 function paginateMap(container){
  const grid=container.querySelector('.quiz-navigation'),size=100,total=session.questions.length,pages=Math.ceil(total/size);let page=Math.floor(session.current/size);
  if(total>20){grid.classList.add('quiz-navigation-dense');root.querySelector('.quiz-layout').classList.add('quiz-layout-dense')}
  const pager=document.createElement('div');pager.className='quiz-map-pager';const prev=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');prev.className=next.className='secondary';prev.type=next.type='button';prev.textContent='←';next.textContent='→';prev.setAttribute('aria-label','Trang câu hỏi trước');next.setAttribute('aria-label','Trang câu hỏi tiếp');pager.append(prev,label,next);grid.after(pager);
  function render(){grid.replaceChildren(...session.questions.slice(page*size,(page+1)*size).map((q,j)=>{const index=page*size+j,button=document.createElement('button');button.type='button';button.dataset.index=index;button.className=navItemClass(session,q,index,study);button.textContent=index+1;button.setAttribute('aria-label','Đến câu '+(index+1));if(index===session.current)button.setAttribute('aria-current','step');return button}));label.textContent=`${page*size+1}–${Math.min(total,(page+1)*size)} / ${total}`;prev.disabled=page===0;next.disabled=page===pages-1}
  prev.onclick=()=>{page--;render()};next.onclick=()=>{page++;render()};render();
 }
 aside.classList.add('quiz-map-card');aside.querySelector('p').textContent='Chọn số để chuyển câu.';paginateMap(aside);

 const feedback=card.querySelector('.feedback');
 if(feedback){
  feedback.replaceChildren();
  const mainRow=document.createElement('div');mainRow.className='feedback-main-row';
  const result=document.createElement('strong');result.textContent=(isCorrect(question,session.answers[question.id])?'✓ Đúng':'✕ Chưa đúng')+' · Đáp án: '+question.answer;
  mainRow.append(result);
  if(question.explanation){
   const expBox=document.createElement('div');expBox.className='feedback-inline-exp';expBox.hidden=false;
   expBox.tabIndex=0;expBox.setAttribute('role','region');expBox.setAttribute('aria-label','Giải thích đáp án');
   for(const event of ['pointerdown','wheel','focus','touchstart'])expBox.addEventListener(event,()=>clearTimeout(window._autoAdvanceTimer),{passive:true});
   const expTitle=document.createElement('b');expTitle.textContent=(question.explanationSource==='gemini'||question.answerSource==='gemini')?'Giải thích AI · cần kiểm tra:':'Ghi chú / Giải thích:';
   const expText=document.createElement('span');expText.textContent=question.explanation;
   expBox.append(expTitle,expText);
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
