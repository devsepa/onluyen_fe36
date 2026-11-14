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

  // Header with title, badge and copy button
  const headRow = add(box, 'div', 'explanation-card-header');
  const titleWrap = add(headRow, 'div', 'exp-header-title');
  add(titleWrap, 'span', 'exp-sparkle-icon', '✨');
  add(titleWrap, 'strong', '', details||question.explanationSource==='gemini'||question.answerSource==='gemini'?'Giải thích':'Ghi chú / Giải thích');
  if(details){
   add(titleWrap, 'span', 'exp-badge ' + (details.reviewed?'badge-reviewed':details.reused?'badge-reused':'badge-new'), details.reviewed?'✓ Đã kiểm duyệt':details.reused?'⚡ Đã lưu chung':'Tự động lưu');
  }

  const copyBtn = add(headRow, 'button', 'btn-copy-explanation', '📋 Sao chép');
  copyBtn.type = 'button';
  copyBtn.title = 'Sao chép nội dung giải thích vào bộ nhớ tạm';
  copyBtn.onclick = async () => {
   try {
    const choices = question.options.map(o => `${o.id}. ${o.text || details?.options?.find(item => item.id === o.id)?.text || ''}`);
    let copyText = `[CÂU HỎI]: ${question.stem || ('Slide ' + question.slide)}\n${choices.join('\n')}\n\n`;
    copyText += `[ĐÁP ÁN ĐÚNG]: ${question.answer}\n`;
    copyText += `[ĐIỂM MẤU CHỐT]: ${details?.reason || explanation || ''}\n`;
    if (details?.options?.length) {
     copyText += `\n[CHI TIẾT TỪNG PHƯƠNG ÁN]:\n`;
     for (const o of details.options) {
      const isRight = question.answer.includes(o.id);
      copyText += `- ${o.id} (${isRight ? 'Đúng' : 'Sai'}): ${o.reason}\n`;
     }
    }
    const tipText = getSmartTip(question, details);
    if (tipText) copyText += `\n[MẸO GHI NHỚ]: ${tipText}\n`;
    await navigator.clipboard.writeText(copyText.trim());
    copyBtn.textContent = '✓ Đã chép!';
    copyBtn.classList.add('copied');
    setTimeout(() => {
     if (copyBtn.isConnected) {
      copyBtn.textContent = '📋 Sao chép';
      copyBtn.classList.remove('copied');
     }
    }, 2000);
   } catch {}
  };

  const choices=question.options.map(o=>({id:o.id,text:o.text||details?.options.find(item=>item.id===o.id)?.text||''}));
  const content=labels=>[...labels].map(id=>{const text=choices.find(o=>o.id===id)?.text;return id+(text?' — '+text:'')}).join('\n');

  add(add(box,'div','explanation-answer'),'strong','', 'Chọn '+content(question.answer));
  const tip = getSmartTip(question, details);
  if(tip){
   const tipBox = add(box, 'div', 'explanation-tip-box');
   const tipHead = add(tipBox, 'div', 'explanation-tip-heading');
   add(tipHead, 'span', 'tip-icon', '💡');
   add(tipHead, 'strong', '', 'Mẹo nhớ');
   add(tipBox, 'div', 'explanation-tip-text', tip);
  }
  // Core rationale card
  const coreBox = add(box, 'div', 'exp-core-box');
  add(coreBox, 'div', 'exp-core-title', 'Tại sao đúng');
  add(coreBox, 'div', 'exp-core-text', details?.reason||explanation);

  // Option breakdown cards if available
  if (details?.options?.length) {
   const optionsGrid = add(box, 'div', 'exp-options-grid');
   for (const o of details.options) {
    const isCorrectOpt = question.answer.includes(o.id);
    const isUserPicked = (answered || '').includes(o.id);
    const optCard = add(optionsGrid, 'div', 'exp-option-card ' + (isCorrectOpt ? 'is-correct' : 'is-distractor') + (isUserPicked ? ' user-picked' : ''));
    const optHead = add(optCard, 'div', 'exp-option-head');
    add(optHead, 'span', 'exp-option-badge ' + (isCorrectOpt ? 'badge-correct' : 'badge-distractor'), (isCorrectOpt ? '✓ ' : '✕ ') + o.id);
    if (o.text) add(optHead, 'span', 'exp-option-text', o.text);
    if (isUserPicked) {
     add(optHead, 'span', 'exp-user-tag ' + (isCorrectOpt ? 'user-right' : 'user-wrong'), isCorrectOpt ? 'Bạn chọn đúng' : 'Bạn đã chọn');
    }
    add(optCard, 'div', 'exp-option-reason', o.reason);
   }
  } else {
   if(!isCorrect(question,answered)){
    add(add(box,'div','explanation-chosen'),'strong','', 'Bạn chọn '+content(answered));
   }
  }

  box.scrollTop=scroll;
 }
 if(state.status==='error'&&state.comparison){renderAnswerComparison(feedback,question,state.comparison,scroll);return feedback}
 if(state.status==='error'){
  const status=add(feedback,'div','study-explanation-status');add(status,'span','',state.error);
  const retry=add(status,'button','secondary explanation-retry','Thử lại');retry.type='button';retry.onclick=()=>{onRead();onRetry?.(question)};
  if(state.statusCode===429&&state.retryAt>Date.now()){
   const wait=Math.ceil((state.retryAt-Date.now())/1000);retry.disabled=true;retry.textContent='Thử lại sau '+(wait>=60?Math.ceil(wait/60)+' phút':wait+' giây');
   add(status,'small','','Hạn mức có thể cần lâu hơn để phục hồi.');
   setTimeout(()=>{if(retry.isConnected){retry.disabled=false;retry.textContent='Thử lại'}},Math.min(2147483647,Math.max(1,state.retryAt-Date.now())));
  }
 }else if(['queued','loading','no-auth','idle'].includes(state.status)&&!explanation){
  add(feedback,'div','study-explanation-status',state.status==='queued'?'Đang chờ tạo giải thích AI…':'⚡ Đang tạo giải thích AI… (bạn có thể bấm Tiếp để làm tiếp)');
 }
 return feedback;
}

function renderAnswerComparison(feedback,question,comparison,scroll=0){
 const box=add(feedback,'section','feedback-inline-exp explanation-conflict');box.setAttribute('aria-label','Đối chiếu đáp án gốc và AI');box.tabIndex=0;
 add(box,'strong','comparison-title','AI khác đáp án gốc — cần đối chiếu');
 const note=add(box,'p','comparison-note','Đáp án gốc vẫn được giữ để chấm bài. Gợi ý AI chưa được xác nhận.');
 const pair=add(box,'div','comparison-pair'),content=labels=>[...labels].map(id=>{const text=question.options.find(o=>o.id===id)?.text||comparison.options.find(o=>o.id===id)?.text||'';return id+(text?' — '+text:'')}).join('\n');
 const original=add(pair,'article','comparison-original');add(original,'h3','',question.answerSource==='speaker-notes'?'Đáp án từ ghi chú':question.answerSource==='gemini'?'Đáp án AI đang lưu':'Đáp án đang lưu');add(original,'p','comparison-answer',content(comparison.originalAnswer));
 const proposed=add(pair,'article','comparison-proposed');add(proposed,'h3','','AI đề xuất · chưa xác nhận');add(proposed,'p','comparison-answer',content(comparison.suggestedAnswer));
 box.append(note);
 const reason=add(box,'div','comparison-rationale');add(reason,'strong','','Lý do AI đưa ra');add(reason,'p','',comparison.reason);
 const actions=add(box,'div','comparison-actions');if(question.url||question.sharedDeck||question.mediaId){const preview=add(actions,'button','secondary','Đối chiếu ảnh gốc');preview.type='button';preview.dataset.previewSlide=question.id}
 const report=add(actions,'button','secondary','Báo lỗi khác đáp án');report.type='button';report.dataset.reportQuestion=question.id;box.scrollTop=scroll;
}
