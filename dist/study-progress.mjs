import {isCorrect} from './core.mjs?v=2026.11.15.38';
import {subjectKey,questionSubject} from './subjects.mjs?v=2026.11.15.38';
import {bankQuestionKey} from './bank-merge.mjs?v=2026.11.15.38';
export function sessionSummary(s,now=Date.now()){
 if(!s||s.done||!s.questions?.length)return null;
 return {title:s.questions[0].sourceName||'Bài đang làm',total:s.questions.length,answered:s.questions.filter(q=>!!s.answers?.[q.id]).length,current:Math.min(s.questions.length,Math.max(1,(s.current||0)+1)),expired:s.mode==='exam'&&s.deadline<=now};
}
export function learningStats(history){
 const subjects=new Map(),questions=new Map();
 for(const result of [...history].sort((a,b)=>(a.finished||0)-(b.finished||0))){
  const perResult=new Map();
  for(const q of result.questions||[]){
   const key=subjectKey(q),group=subjects.get(key)||{key,label:questionSubject(q)||q.sourceName||'Chưa rõ môn',attempted:0,correct:0,skipped:0,firstTry:0,scores:[]};subjects.set(key,group);
   const score=perResult.get(key)||{correct:0,total:0};score.total++;perResult.set(key,score);
   const answer=result.answers?.[q.id];if(!answer){group.skipped++;continue}
   const correct=isCorrect(q,answer),wrong=result.wrongAttempts?.[q.id]?.length||0;
   group.attempted++;if(correct)group.correct++;if(correct&&!wrong)group.firstTry++;
   if(correct)score.correct++;
   const qKey=bankQuestionKey(q),item=questions.get(qKey)||{question:q,attempted:0,wrong:0,retries:0};item.attempted++;if(!correct)item.wrong++;item.retries+=wrong;questions.set(qKey,item);
  }
  for(const [key,score]of perResult)subjects.get(key).scores.push(Math.round(score.correct/score.total*100));
 }
 return {subjects:[...subjects.values()].sort((a,b)=>a.label.localeCompare(b.label)),weak:[...questions.values()].filter(q=>q.wrong||q.retries).sort((a,b)=>(b.wrong+b.retries)-(a.wrong+a.retries)).slice(0,10)};
}
