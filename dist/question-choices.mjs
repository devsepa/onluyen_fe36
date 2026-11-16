// Detect only explicit Latin choice labels; never infer a correct answer from OCR.
export function labelsFromImageText(text){
 const labels=[...String(text||'').normalize('NFKC').matchAll(/(?:^|\n)\s*(?:\(([A-H])\)|([A-H])[.)：:])\s*\S/g)].map(m=>m[1]||m[2]);
 const unique=[...new Set(labels)];
 return unique.length>=2&&unique.every((label,i)=>label===String.fromCharCode(65+i))?unique:[];
}
export function resizeQuestionChoices(question,count,{source='manual'}={}){
 if(!Number.isInteger(count)||count<2||count>8)throw Error('Số lựa chọn phải từ 2 đến 8.');
 const ids=Array.from({length:count},(_,i)=>String.fromCharCode(65+i));
 if([...question.answer||''].some(id=>!ids.includes(id)))throw Error('Không thể bỏ lựa chọn đang có trong đáp án. Hãy kiểm tra đáp án gốc trước.');
 if(question.options.slice(count).some(o=>o.text?.trim()))throw Error('Không thể bỏ lựa chọn có nội dung. Hãy sửa đầy đủ trong thư viện.');
 return {...question,options:ids.map(id=>question.options.find(o=>o.id===id)||{id,text:''}),choiceCountSource:source};
}
