// Detect only explicit Latin choice labels; never infer a correct answer from OCR.
export function labelsFromImageText(text){
 const labels=[...String(text||'').normalize('NFKC').matchAll(/(?:^|\n)[ \t]*(?:\(([A-H])\)|\[([A-H])\]|([A-H])[.)：:]|([A-H])[ \t]+)[ \t]*\S/gim)].map(m=>m.slice(1).find(Boolean).toUpperCase());
 const unique=[...new Set(labels)];
 if(unique.length>=2&&unique.every((label,i)=>label===String.fromCharCode(65+i)))return unique;
 // A clearly labeled A-D prefix plus an explicit trailing label can recover a skipped OCR line.
 if('ABCD'.split('').every((id,i)=>unique[i]===id)){const last=Math.max(...unique.map(id=>id.charCodeAt(0)-64));return Array.from({length:last},(_,i)=>String.fromCharCode(65+i))}
 return [];
}
export async function croppedChoiceImage(url){
 const image=new Image();image.src=url;await image.decode();
 const width=Math.round(image.naturalWidth*.72),height=Math.round(image.naturalHeight*.72),scale=Math.min(3,1800/Math.max(width,height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,width,height,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Chưa chuẩn bị được vùng ảnh lựa chọn.');return URL.createObjectURL(blob);
}
export function resizeQuestionChoices(question,count,{source='manual'}={}){
 if(!Number.isInteger(count)||count<2||count>8)throw Error('Số lựa chọn phải từ 2 đến 8.');
 const ids=Array.from({length:count},(_,i)=>String.fromCharCode(65+i));
 if([...question.answer||''].some(id=>!ids.includes(id)))throw Error('Không thể bỏ lựa chọn đang có trong đáp án. Hãy kiểm tra đáp án gốc trước.');
 if(question.options.slice(count).some(o=>o.text?.trim()))throw Error('Không thể bỏ lựa chọn có nội dung. Hãy sửa đầy đủ trong thư viện.');
 return {...question,options:ids.map(id=>question.options.find(o=>o.id===id)||{id,text:''}),choiceCountSource:source};
}
