export function bankQuestionKey(q){
 if(q.sharedDeck&&Number.isInteger(q.sharedIndex))return JSON.stringify(['shared',q.sharedDeck,q.sharedIndex]);
 if(q.url){
  try{const url=new URL(q.url),slide=new URLSearchParams(url.hash.slice(1)).get('slide');if(slide)return JSON.stringify([q.sourceId,'slide',slide])}catch{}
  return JSON.stringify([q.sourceId,'url',q.url]);
 }
 return JSON.stringify([q.sourceId,'number',q.slide??q.id]);
}
// Adding a subject must never discard another source or the learner's reviewed answers.
export function mergeQuestionBanks(existing,incoming){
 const questions=[...existing],indices=new Map(existing.map((q,i)=>[bankQuestionKey(q),i])),ids=new Set(existing.map(q=>q.id));
 for(const candidate of incoming){
  const key=bankQuestionKey(candidate),index=indices.get(key);
  if(index!==undefined){
   const saved=questions[index];
   if(!saved.answer&&saved.answerSource!=='manual'&&candidate.answer){
    questions[index]={...candidate,id:saved.id};
   }else if(!saved.explanation&&candidate.explanation&&saved.answer===candidate.answer){
    questions[index]={...saved,explanation:candidate.explanation,explanationSource:candidate.explanationSource||(candidate.answerSource==='gemini'?'gemini':null)};
   }
   continue;
  }
  const question={...candidate};
  if(!question.id||ids.has(question.id))question.id=crypto.randomUUID();
  ids.add(question.id);indices.set(key,questions.length);questions.push(question);
 }
 return questions;
}
