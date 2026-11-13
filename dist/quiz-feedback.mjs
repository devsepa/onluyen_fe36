function add(parent,tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;parent.append(node);return node}

export function getSmartTip(question, details) {
 if (question.tip && typeof question.tip === 'string' && question.tip.trim()) return question.tip.trim();
 if (details?.tip && typeof details.tip === 'string' && details.tip.trim()) return details.tip.trim();
 
 const rawText = (details?.reason || question.explanation || '');
 const match = rawText.match(/(?:mẹo|gợi ý|tip|lưu ý|bí quyết)[\s:]+([^\n\r]+)/i);
 if (match && match[1]?.trim().length > 10) {
  return match[1].trim();
 }

 const stem = (question.stem || question.title || '').toLowerCase();
 const isMultiple = question.answer && question.answer.length > 1;
 const isNegative = stem.includes('không') || stem.includes('chưa') || stem.includes('sai') || stem.includes('ngoại trừ') || stem.includes('not') || stem.includes('except');
 const isDefinition = stem.includes('là gì') || stem.includes('định nghĩa') || stem.includes('khái niệm') || stem.includes('what is') || stem.includes('which of the following defines');
 const isSql = stem.includes('sql') || stem.includes('select') || stem.includes('query') || stem.includes('table') || stem.includes('database') || stem.includes('khoá') || stem.includes('key');
 const isJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(question.stem || '') || stem.includes('jpd');

 if (isNegative) {
  return '⚠️ Chú ý câu phủ định ("KHÔNG" / "SAI" / "NGOẠI TRỪ"): Hãy tìm và gạch chân 3 phương án ĐÚNG trước để loại trừ, phương án còn lại là đáp án cần chọn.';
 }
 if (isMultiple) {
  return '✨ Dạng chọn nhiều đáp án: Xét từng phương án độc lập đúng/sai. Chú ý các đáp án mang tính tuyệt đối (chỉ duy nhất, luôn luôn) thường là bẫy gây nhiễu.';
 }
 if (isSql) {
  if (stem.includes('having') || stem.includes('where')) {
   return '🔑 Mẹo SQL: WHERE lọc từng dòng TRƯỚC khi gom nhóm; HAVING lọc trên nhóm SAU hàm tổng hợp (COUNT, SUM, AVG).';
  }
  if (stem.includes('primary key') || stem.includes('khóa chính')) {
   return '🔑 Mẹo SQL: Khóa chính (Primary Key) = Bắt buộc UNIQUE + NOT NULL. Mỗi bảng chỉ có duy nhất 1 Primary Key.';
  }
  return '🔑 Mẹo Database/SQL: Đối chiếu thứ tự thực thi truy vấn (FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY) và kiểm tra kỹ điều kiện JOIN.';
 }
 if (isJapanese) {
  return '🎌 Mẹo Tiếng Nhật: Chú ý trợ từ đi kèm (は, が, を, に, で) và đuôi câu (thể thông thường hay lịch sự, khẳng định hay phủ định) để phán đoán ngữ cảnh nhanh.';
 }
 if (isDefinition) {
  const ansChoice = question.options?.find(o => question.answer.includes(o.id));
  const keyword = ansChoice?.text?.slice(0, 45) || question.answer;
  return `💡 Mẹo ghi nhớ: Nhớ từ khóa then chốt gắn với "${keyword}". Khi gặp câu hỏi tương tự, dò tìm từ khóa này đầu tiên.`;
 }
 
 const ansChoice = question.options?.find(o => question.answer.includes(o.id));
 if (ansChoice?.text) {
  return `💡 Mẹo làm bài: Nắm từ khóa trọng tâm ở câu hỏi, đối chiếu nhanh với đáp án [${question.answer}] (${ansChoice.text.slice(0, 50)}${ansChoice.text.length > 50 ? '...' : ''}) để loại bỏ nhanh phương án nhiễu.`;
 }

 return `💡 Mẹo làm bài: Ghi nhớ đáp án chuẩn [${question.answer}]. Đối chiếu với slide bài giảng để ghi nhớ hình ảnh và từ khóa đặc trưng.`;
}

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
