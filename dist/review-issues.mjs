export function slideIssues(row){
 if(['outside','rejected','skipped'].includes(row.status))return [];
 const q=row.question||{},issues=[];
 if(row.imageStatus==='error')issues.push(['image','Không tải được ảnh']);
 if(!q.answer)issues.push(['answer','Thiếu đáp án']);
 if(!q.stem?.trim()||/^Câu hỏi slide \d+$/.test(q.stem))issues.push(['content','Chưa đọc được nội dung câu hỏi']);
 if(!q.options?.length||q.options.some(o=>!o.text?.trim()))issues.push(['choices','Chưa đọc đủ lựa chọn — cần đối chiếu ảnh']);
 if(q.answer&&[...q.answer].some(id=>!q.options?.some(o=>o.id===id)))issues.push(['choices','Đáp án nằm ngoài các lựa chọn']);
 return issues;
}
export function resultSummary(result,isCorrect){
 const questions=result.questions||[],answers=result.answers||{};
 const correct=questions.filter(q=>isCorrect(q,answers[q.id])).length;
 const unanswered=questions.filter(q=>!answers[q.id]).length;
 const end=result.mode==='exam'&&Number.isFinite(result.deadline)?Math.min(result.finished,result.deadline):result.finished;
 const seconds=Math.max(0,Math.round((end-result.started)/1000));
 return {total:questions.length,correct,unanswered,wrong:questions.length-correct-unanswered,seconds,averageSeconds:questions.length?Math.round(seconds/questions.length):0};
}
