function add(parent,tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;parent.append(node);return node}

function isGenericTip(str) {
 if (!str || typeof str !== 'string') return true;
 const s = str.toLowerCase();
 return s.includes('đối chiếu với slide') ||
        s.includes('ghi nhớ đáp án chuẩn') ||
        s.includes('nắm từ khóa trọng tâm ở câu hỏi') ||
        s.includes('chưa có mẹo') ||
        s.length < 15;
}

export function getSmartTip(question, details) {
 if (details?.tip && !isGenericTip(details.tip)) return details.tip.trim();
 if (question.tip && question.answerSource!=='gemini' && !isGenericTip(question.tip)) return question.tip.trim();

 const rawText = (details?.reason || question.explanation || '');
 const match = rawText.match(/(?:mẹo|gợi ý|tip|lưu ý|bí quyết|chú ý|quy tắc|công thức)[\s:]+([^\n\r]+)/i);
 if (match && match[1]?.trim().length > 10 && !isGenericTip(match[1])) {
  return match[1].trim();
 }

 return null;
}

export function renderQuizFeedback({root,session,question,isCorrect,state={status:'idle'},onRetry,onRead=()=>{}}){
 const card=root.querySelector('.quiz-question'),answered=session.answers[question.id];
 if(session.mode!=='study'){card.querySelector('.feedback')?.remove();return}
 const wrongCount=session.wrongAttempts?.[question.id]?.length||0;
 if(!answered){card.querySelector('.feedback')?.remove();if(wrongCount){const feedback=add(card,'div','feedback incorrect study-retry-feedback');feedback.setAttribute('role','status');add(feedback,'strong','',`Chưa đúng · đã sai ${wrongCount} lần.`);add(feedback,'div','',`Bạn có thể chọn lại. Đáp án sẽ hiện nếu sai lần thứ ${(session.wrongAttemptLimit||0)+1}, hoặc ngay khi chọn đúng.`);return feedback}return}
 let feedback=card.querySelector('.feedback');
 if(!feedback){feedback=document.createElement('div');feedback.className='feedback';const before=card.querySelector('.quiz-shortcuts-hint');before?before.before(feedback):card.append(feedback)}
 const scroll=feedback.querySelector('.feedback-inline-exp')?.scrollTop||0;
 feedback.className='feedback '+(isCorrect(question,answered)?'right':'incorrect');feedback.setAttribute('role','status');feedback.replaceChildren();
 const row=add(feedback,'div','feedback-main-row');add(row,'strong','',(isCorrect(question,answered)?'✓ Đúng':'✕ Chưa đúng')+' · Đáp án: '+question.answer);
 const report=add(row,'button','secondary quality-report-button','Báo lỗi');report.type='button';report.dataset.reportQuestion=question.id;
 if(wrongCount)add(feedback,'small','',`Đã thử sai ${wrongCount} lần trước khi chốt câu này.`);
 const details=state.details;
 const explanation=question.explanationSource==='gemini'||question.answerSource==='gemini'?'':question.explanation;
 if(details||explanation){
  const box=add(feedback,'div','feedback-inline-exp');box.tabIndex=0;box.setAttribute('role','region');box.setAttribute('aria-label','Giải thích đáp án');
  for(const event of ['pointerdown','wheel','focus','touchstart'])box.addEventListener(event,onRead,{passive:true});
  add(box,'b','',details||question.explanationSource==='gemini'||question.answerSource==='gemini'?'Giải thích AI · cần kiểm tra:':'Ghi chú / Giải thích:');
  if(details)add(box,'small','explanation-storage-note',details.reviewed?'Đã được kiểm duyệt':details.reused?'Đã lưu · dùng lại từ kho giải thích chung':'Tự động lưu cho lần ôn sau');
  const choices=question.options.map(o=>({id:o.id,text:o.text||details?.options.find(item=>item.id===o.id)?.text||''}));
  const content=labels=>[...labels].map(id=>{const text=choices.find(o=>o.id===id)?.text;return id+(text?' — '+text:'')}).join('\n');
  add(add(box,'div','explanation-answer'),'strong','', 'Chọn '+content(question.answer));
  if(details)add(box,'b','explanation-heading','Tại sao đúng:');
  add(box,'span','explanation-reason',details?.reason||explanation);
  if(!isCorrect(question,answered)){
   add(add(box,'div','explanation-chosen'),'strong','', 'Bạn chọn '+content(answered));
   if(details){
    const extra=[...answered].filter(id=>!question.answer.includes(id)),missing=[...question.answer].filter(id=>!answered.includes(id));
    for(const id of extra){const option=details.options.find(o=>o.id===id);if(option)add(box,'p','explanation-choice-reason',`${id}: ${option.reason}`)}
    if(missing.length&&question.answer.length>1){add(box,'p','explanation-choice-reason','Bạn còn thiếu: '+missing.join(', ')+'.');for(const id of missing){const option=details.options.find(o=>o.id===id);if(option)add(box,'p','explanation-choice-reason',`${id}: ${option.reason}`)}}
   }
  }
  const tip = getSmartTip(question, details);
  if(tip){
   const tipBox = add(box, 'div', 'explanation-tip-box');
   const tipHead = add(tipBox, 'div', 'explanation-tip-heading');
   add(tipHead, 'span', 'tip-icon', '💡');
   add(tipHead, 'strong', '', 'Mẹo xử lý & Ghi nhớ nhanh:');
   add(tipBox, 'div', 'explanation-tip-text', tip);
  }
  box.scrollTop=scroll;
 }
 if(state.status==='error'){
  const status=add(feedback,'div','study-explanation-status');add(status,'span','',state.error);
  const retry=add(status,'button','secondary explanation-retry','Thử lại');retry.type='button';retry.onclick=()=>{onRead();onRetry?.(question)};
  if(state.statusCode===429&&state.retryAt>Date.now()){
   const wait=Math.ceil((state.retryAt-Date.now())/1000);retry.disabled=true;retry.textContent='Thử lại sau '+(wait>=60?Math.ceil(wait/60)+' phút':wait+' giây');
   add(status,'small','','Hạn mức có thể cần lâu hơn để phục hồi.');
   setTimeout(()=>{if(retry.isConnected){retry.disabled=false;retry.textContent='Thử lại'}},Math.min(2147483647,Math.max(1,state.retryAt-Date.now())));
  }
 }else if(['queued','loading','no-auth','idle'].includes(state.status)&&!explanation){
  add(feedback,'div','study-explanation-status',state.status==='queued'?'Đang chờ tạo giải thích AI…':'Đang tạo giải thích AI…');
 }
 return feedback;
}
