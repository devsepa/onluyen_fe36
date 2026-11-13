export function questionSubject(question){
 const name=String(question.sourceName||'').normalize('NFKC').toUpperCase();
 return name.match(/(?:^|[^A-Z0-9])([A-Z]{2,5}\d{2,4}[A-Z]?)(?=$|[^A-Z0-9])/)?.[1]||'';
}
export function subjectKey(question){
 return questionSubject(question)||`source:${question.sourceId}`;
}
export function practiceSubjects(questions){
 const groups=new Map();
 for(const question of questions){
  const key=subjectKey(question);
  const group=groups.get(key)||{key,label:questionSubject(question)||`Chưa rõ mã môn · ${question.sourceName||'Tài liệu đã nhập'}`,count:0};
  group.count++;groups.set(key,group);
 }
 return [...groups.values()].sort((a,b)=>a.label.localeCompare(b.label,'vi',{numeric:true}));
}
