import {bankQuestionKey} from './bank-merge.mjs';
import {shuffle} from './core.mjs';
export const selectionKey=q=>JSON.stringify([bankQuestionKey(q),q.sourceVersion||'']);
export function createStudySelection(storage,history=[],session){
 let used=new Set();
 try{const saved=JSON.parse(storage.getItem('sot-study-drawn-v1')||'null');if(saved?.version===1&&Array.isArray(saved.used))used=new Set(saved.used.filter(k=>typeof k==='string'));else for(const result of [...history,session].filter(Boolean))for(const q of result.questions||[])used.add(selectionKey(q))}catch{}
 function save(next){storage.setItem('sot-study-drawn-v1',JSON.stringify({version:1,used:[...next]}));used=next}
 function refresh(){try{const saved=JSON.parse(storage.getItem('sot-study-drawn-v1')||'null');if(saved?.version===1&&Array.isArray(saved.used))used=new Set(saved.used.filter(k=>typeof k==='string'))}catch{}}
 return {
  remaining(questions){refresh();return questions.filter(q=>!used.has(selectionKey(q)))},
  select(questions,count,strategy='unseen'){refresh();const pool=strategy==='unseen'?questions.filter(q=>!used.has(selectionKey(q))):questions;return shuffle(pool).slice(0,count)},
  commit(questions){refresh();const previous=new Set(used);save(new Set([...used,...questions.map(selectionKey)]));return ()=>save(previous)},
  reset(questions){refresh();const next=new Set(used);for(const q of questions)next.delete(selectionKey(q));save(next)}
 };
}
