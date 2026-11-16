import {isCorrect} from './core.mjs?v=2026.11.16.26';
import {bankQuestionKey} from './bank-merge.mjs?v=2026.11.16.26';
import {subjectKey} from './subjects.mjs?v=2026.11.16.26';

const storageKey='sot-review-queue-v1';
export function createReviewQueue(storage){
 let state;
 try{state=JSON.parse(storage.getItem(storageKey)||'null')}catch{}
 if(!state||!Array.isArray(state.questions)||!Array.isArray(state.processed))state={questions:[],processed:[]};
 function save(next){storage.setItem(storageKey,JSON.stringify(next));state=next}
 return {
  questions:()=>state.questions.map(q=>structuredClone(q)),
  record(result){
   if(!result?.id||state.processed.includes(result.id))return;
   const questions=new Map(state.questions.map(q=>[bankQuestionKey(q),q]));
   for(const q of result.questions){const key=bankQuestionKey(q);if(!isCorrect(q,result.answers?.[q.id]))questions.set(key,structuredClone(q));else if(result.reviewQueue)questions.delete(key)}
   save({questions:[...questions.values()],processed:[...state.processed,result.id]});
  },
  mastered(question){const key=bankQuestionKey(question),questions=state.questions.filter(q=>bankQuestionKey(q)!==key);if(questions.length!==state.questions.length)save({...state,questions})}
 };
}

export function questionType(q){
 const explicit=q.topic||q.questionType||q.skill;
 if(typeof explicit==='string'&&explicit.trim())return explicit.trim();
 // Distractors do not determine a question's topic.
 const text=[q.stem,q.content].filter(x=>typeof x==='string').join(' ');
 if(/\b(SELECT|WHERE|HAVING|JOIN|GROUP BY|SQL)\b/i.test(text)){
  if(/\bJOIN\b/i.test(text))return 'SQL · Kết nối bảng';
  if(/\b(GROUP BY|HAVING|COUNT\s*\(|SUM\s*\(|AVG\s*\()\b/i.test(text))return 'SQL · Gom nhóm và tổng hợp';
  return 'SQL · Truy vấn và lọc dữ liệu';
 }
 return '';
}
export function relatedQuestions(question,bank,limit=5){
 const type=questionType(question);if(!type)return [];
 const key=bankQuestionKey(question);
 return bank.filter(q=>q.answer&&q.options?.length>=2&&bankQuestionKey(q)!==key&&subjectKey(q)===subjectKey(question)&&questionType(q)===type).slice(0,limit);
}
export function mapQuestions(session,filter='all'){
 return session.questions.map((q,index)=>({q,index})).filter(({q})=>filter==='unanswered'?!session.answers?.[q.id]:filter==='flagged'?session.flags?.includes(q.id):true);
}

export function mountResultPractice({root,result,bank,start}){
 root.querySelectorAll('.question-card').forEach(card=>{
  // Result filters can hide questions, so resolve the original question number.
  const number=Number(card.querySelector('.question-top>span')?.textContent.match(/\d+/)?.[0]);
  const q=result.questions[number-1];if(!q)return;
  const fullNote=card.querySelector('.note-explanation p');
  if(fullNote&&Array.from(fullNote.textContent).length>240){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=Array.from(fullNote.textContent).slice(0,200).join('')+'… · Xem toàn bộ lời giải';fullNote.before(details);details.append(summary,fullNote)}
  const type=questionType(q),related=relatedQuestions(q,bank);
  const section=document.createElement('section');section.className='result-practice-type';
  if(type){const label=document.createElement('p');label.textContent='Dạng bài: '+type;section.append(label)}
  if(!q.explanation?.trim()&&!q.explanationDetails?.reason?.trim()){
   const note=document.createElement('p');note.className='muted';note.textContent='Chưa có lời giải cho câu này. Đối chiếu slide gốc; hệ thống không tự đoán lời giải.';section.append(note);
  }else if(!q.explanation?.trim()&&q.explanationDetails?.reason){
   const label=document.createElement('strong');label.textContent=q.explanationDetails.reviewed?'Giải thích đã duyệt':'Giải thích AI · cần kiểm tra';
   const explanation=document.createElement('p');explanation.textContent=q.explanationDetails.reason;section.append(label,explanation);
  }
  const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=related.length?`Luyện thêm dạng này · ${related.length} câu`:'Chưa có câu cùng dạng';button.disabled=!related.length;button.onclick=()=>start(related,false);section.append(button);card.append(section);
 });
}
