function add(parent,tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;parent.append(node);return node}
export function renderQuizFeedback({root,session,question,isCorrect,state={status:'idle'},onRetry,onRead=()=>{}}){
 const card=root.querySelector('.quiz-question'),answered=session.answers[question.id];
 if(session.mode!=='study'||!answered){card.querySelector('.feedback')?.remove();return}
 let feedback=card.querySelector('.feedback');
 if(!feedback){feedback=document.createElement('div');feedback.className='feedback';const before=card.querySelector('.quiz-shortcuts-hint');before?before.before(feedback):card.append(feedback)}
 const scroll=feedback.querySelector('.feedback-inline-exp')?.scrollTop||0;
 feedback.className='feedback '+(isCorrect(question,answered)?'right':'incorrect');feedback.setAttribute('role','status');feedback.replaceChildren();
 const row=add(feedback,'div','feedback-main-row');add(row,'strong','',(isCorrect(question,answered)?'✓ Đúng':'✕ Chưa đúng')+' · Đáp án: '+question.answer);
 const details=state.details;
 if(details||question.explanation){
  const box=add(feedback,'div','feedback-inline-exp');box.tabIndex=0;box.setAttribute('role','region');box.setAttribute('aria-label','Giải thích đáp án');
  for(const event of ['pointerdown','wheel','focus','touchstart'])box.addEventListener(event,onRead,{passive:true});
  add(box,'b','',details||question.explanationSource==='gemini'||question.answerSource==='gemini'?'Giải thích AI · cần kiểm tra:':'Ghi chú / Giải thích:');
  const choices=question.options.map(o=>({id:o.id,text:o.text||details?.options.find(item=>item.id===o.id)?.text||''}));
  const content=labels=>[...labels].map(id=>{const text=choices.find(o=>o.id===id)?.text;return id+(text?' — '+text:'')}).join('\n');
  add(add(box,'div','explanation-answer'),'strong','', 'Chọn '+content(question.answer));
  if(details)add(box,'b','explanation-heading','Tại sao đúng:');
  add(box,'span','explanation-reason',details?.reason||question.explanation);
  if(!isCorrect(question,answered)){
   add(add(box,'div','explanation-chosen'),'strong','', 'Bạn chọn '+content(answered));
   if(details){
    const extra=[...answered].filter(id=>!question.answer.includes(id)),missing=[...question.answer].filter(id=>!answered.includes(id));
    for(const id of extra){const option=details.options.find(o=>o.id===id);if(option)add(box,'p','explanation-choice-reason',`${id}: ${option.reason}`)}
    if(missing.length&&question.answer.length>1){add(box,'p','explanation-choice-reason','Bạn còn thiếu: '+missing.join(', ')+'.');for(const id of missing){const option=details.options.find(o=>o.id===id);if(option)add(box,'p','explanation-choice-reason',`${id}: ${option.reason}`)}}
   }
  }
  box.scrollTop=scroll;
 }
 if(state.status==='error'){
  const status=add(feedback,'div','study-explanation-status');add(status,'span','',state.error);
  if([401,403].includes(state.statusCode))add(status,'span','', ' Đăng nhập Google ở ảnh đại diện rồi bấm Thử lại.');
  const retry=add(status,'button','secondary explanation-retry','Thử lại');retry.type='button';retry.onclick=()=>{onRead();onRetry?.(question)};
 }else if(['queued','loading'].includes(state.status)&&!question.explanation){
  add(feedback,'div','study-explanation-status',state.status==='queued'?'Đang chờ tạo giải thích AI…':'Đang tạo giải thích AI…');
 }else if(state.status==='no-auth'&&!question.explanation){
  const status=add(feedback,'div','study-explanation-status');
  add(status,'span','','Chưa có giải thích sẵn cho câu này. Đăng nhập Google ở góc trên để AI tạo giải thích mới.');
 }
 return feedback;
}
