export const publishSourceKey=q=>String(q.sourceId||q.sourceName||'local');
export function publishSources(bank){
 const groups=new Map();
 for(const q of bank){const id=publishSourceKey(q);if(!groups.has(id))groups.set(id,{id,name:q.sourceName||'Bộ câu hỏi trên máy',count:0});groups.get(id).count++}
 return [...groups.values()];
}
export const questionsForPublish=(bank,id)=>id?bank.filter(q=>publishSourceKey(q)===id):[];
