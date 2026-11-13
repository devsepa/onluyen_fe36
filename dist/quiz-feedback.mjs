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
 if (question.tip && !isGenericTip(question.tip)) return question.tip.trim();
 if (details?.tip && !isGenericTip(details.tip)) return details.tip.trim();
 
 const rawText = (details?.reason || question.explanation || '');
 const match = rawText.match(/(?:mẹo|gợi ý|tip|lưu ý|bí quyết|chú ý|quy tắc|công thức)[\s:]+([^\n\r]+)/i);
 if (match && match[1]?.trim().length > 10 && !isGenericTip(match[1])) {
  return match[1].trim();
 }

 const fullText = `${question.stem || ''} ${question.title || ''} ${rawText} ${question.sourceName || ''}`.toLowerCase();

 const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(fullText) || fullText.includes('jpd') || fullText.includes('tiếng nhật');
 if (hasJapanese) {
  if (fullText.includes('はい') || fullText.includes('いいえ') || fullText.includes('ですか')) {
   return 'Mẹo hội thoại: Với câu hỏi nghi vấn「〜ですか」, nếu câu trả lời lặp lại khẳng định (〜です) ➔ Luôn chọn「はい」(Vâng/Đúng); nếu câu trả lời phủ định (〜じゃありません / ではありません) ➔ Chọn「いいえ」(Không).';
  }
  if (fullText.includes('から') || fullText.includes('まで')) {
   return 'Mẹo trợ từ:「〜から」(bắt đầu từ...) và「〜まで」(đến / kết thúc tại...). Đi cùng nhau thành cặp「Aから Bまで」. Nếu vế sau là hành động có hạn chót dứt khoát thì dùng「〜までに」(trước khi).';
  }
  if (fullText.includes('どこ') || fullText.includes('だれ') || fullText.includes('いつ') || fullText.includes('なに') || fullText.includes('なん')) {
   return 'Mẹo từ để hỏi: どこ (ở đâu ➔ địa điểm); だれ / どなた (ai ➔ người); いつ (khi nào ➔ thời gian); なん / なに (cái gì). Nhìn vào từ chỉ đối tượng trong câu trả lời để suy ngược từ để hỏi tương ứng.';
  }
  if (fullText.includes('ください') || fullText.includes('てもいい') || fullText.includes('てはいけません')) {
   return 'Mẹo thể て:「〜てください」(Hãy làm... - yêu cầu lịch sự);「〜てもいいです」(Được phép làm...);「〜てはいけません」(Cấm / Tuyệt đối không được làm...).';
  }
  if (fullText.includes('phương tiện') || fullText.includes('xe bus') || fullText.includes('tàu điện') || fullText.includes('đi bằng') || fullText.includes('bằng đũa')) {
   return 'Mẹo trợ từ「で」: Chỉ phương tiện di chuyển (xe bus, tàu...), công cụ/phương thức thực hiện (bằng bút, đũa...), hoặc địa điểm diễn ra hành động.';
  }
  if (fullText.includes('mốc thời gian') || fullText.includes('vào lúc') || fullText.includes('nơi đến') || fullText.includes('tồn tại')) {
   return 'Mẹo trợ từ「に」: Đứng sau mốc thời gian có con số cụ thể (vào lúc 7 giờ, thứ Hai...) và sau địa điểm khi đi với động từ tồn tại (います / あります).';
  }
  return 'Mẹo làm bài: Xác định trợ từ then chốt (は, が, を, に, で) và đuôi câu (khẳng định 〜です hay phủ định 〜じゃありません, quá khứ 〜でした) để loại suy đáp án ngay.';
 }

 const isSql = fullText.includes('sql') || fullText.includes('select') || fullText.includes('query') || fullText.includes('table') || fullText.includes('database') || fullText.includes('dbi');
 if (isSql) {
  if (fullText.includes('having') || fullText.includes('where')) {
   return 'Mẹo SQL: WHERE lọc từng dòng TRƯỚC khi gom nhóm; HAVING lọc trên nhóm SAU hàm tổng hợp (COUNT, SUM, AVG). HAVING không bao giờ đứng trước WHERE.';
  }
  if (fullText.includes('primary key') || fullText.includes('khóa chính')) {
   return 'Mẹo SQL: Khóa chính (Primary Key) bắt buộc UNIQUE và NOT NULL. Mỗi bảng chỉ có duy nhất 1 khóa chính (có thể gồm 1 hoặc nhiều cột ghép lại).';
  }
  if (fullText.includes('foreign key') || fullText.includes('khóa ngoại')) {
   return 'Mẹo SQL: Khóa ngoại (Foreign Key) tham chiếu tới khóa chính của bảng khác để đảm bảo toàn vẹn dữ liệu (Referential Integrity), và CÓ THỂ nhận giá trị NULL.';
  }
  if (fullText.includes('count')) {
   return 'Mẹo SQL: COUNT(*) đếm toàn bộ các bản ghi bao gồm cả NULL; COUNT(tên_cột) chỉ đếm các giá trị KHÁC NULL.';
  }
  if (fullText.includes('group by')) {
   return 'Mẹo SQL: Mọi cột không thuộc hàm tổng hợp (SUM, AVG, MAX...) trong mệnh đề SELECT đều BẮT BUỘC phải xuất hiện trong mệnh đề GROUP BY.';
  }
  if (fullText.includes('join')) {
   return 'Mẹo SQL: INNER JOIN chỉ giữ lại các dòng khớp ở cả 2 bảng; LEFT JOIN giữ toàn bộ dòng bảng bên trái kể cả khi bảng bên phải không có bản ghi tương ứng (điền NULL).';
  }
  if (fullText.includes('distinct')) {
   return 'Mẹo SQL: DISTINCT loại bỏ các bản ghi trùng lặp và được áp dụng cho toàn bộ các cột liệt kê sau nó trong mệnh đề SELECT.';
  }
 }

 if (fullText.includes('http') || fullText.includes('status code')) {
  return 'Mẹo mã trạng thái HTTP: 2xx (Thành công - 200 OK); 3xx (Chuyển hướng - 301, 302); 4xx (Lỗi Client - 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found); 5xx (Lỗi Server - 500, 502, 503).';
 }
 if (fullText.includes('osi') || fullText.includes('mô hình osi')) {
  return 'Mẹo 7 tầng OSI: Nhớ câu thần chú "All People Seem To Need Data Processing" (Application ➔ Presentation ➔ Session ➔ Transport ➔ Network ➔ Data Link ➔ Physical).';
 }
 if (fullText.includes('acid')) {
  return 'Mẹo ACID trong Transaction: Atomicity (Nguyên tử - Tất cả hoặc không có gì), Consistency (Nhất quán), Isolation (Cô lập), Durability (Bền vững lưu trữ).';
 }

 const isNegative = fullText.includes('không') || fullText.includes('chưa') || fullText.includes('sai') || fullText.includes('ngoại trừ') || fullText.includes('not') || fullText.includes('except');
 if (isNegative && (question.stem || rawText).length > 20) {
  return 'Mẹo loại trừ câu phủ định: Tìm và gạch chân 3 phương án ĐÚNG trước. Phương án sai hoặc khác biệt còn lại chính là đáp án cần chọn.';
 }

 if (question.answer && question.answer.length > 1) {
  return 'Mẹo chọn nhiều đáp án: Xét từng phương án độc lập. Cảnh giác với phương án dùng từ mang tính tuyệt đối ("luôn luôn", "chỉ duy nhất", "không bao giờ") vì thường là bẫy.';
 }

 return null;
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
