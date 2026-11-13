export function nextUnanswered(session){
 for(let step=1;step<session.questions.length;step++){
  const index=(session.current+step)%session.questions.length;
  if(!session.answers[session.questions[index].id])return index;
 }
 return -1;
}
export function explanationFromResult(question,result){
 if(result?.status!=='answered'||!result.explanation?.trim())throw Error('AI chưa giải thích được câu này.');
 if([...result.answer].sort().join('')!==[...question.answer].sort().join(''))
  throw Error(`AI đề xuất đáp án ${result.answer}, khác đáp án gốc ${question.answer}. Hãy đối chiếu slide; đáp án gốc vẫn được giữ.`);
 return result.explanation.trim();
}
