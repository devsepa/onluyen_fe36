import {mergeQuestionBanks,bankQuestionKey} from './bank-merge.mjs?v=2026.11.14.32';

// Separate durable metadata store: deleting a bank never deletes its slide images.
export function createBankRecoveryStore({indexedDB=globalThis.indexedDB}={}){
 let opened;
 const open=()=>opened??=new Promise((resolve,reject)=>{
  if(!indexedDB)return reject(Error('Không mở được nơi lưu khôi phục. Chưa xóa câu hỏi.'));
  const request=indexedDB.open('sot-bank-recovery-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('deletions',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=request.onblocked=()=>reject(Error('Không mở được nơi lưu khôi phục. Chưa xóa câu hỏi.'));
 });
 async function archive(questions,label){
  const record={id:crypto.randomUUID(),createdAt:Date.now(),label,questions:structuredClone(questions)};
  const db=await open();await new Promise((resolve,reject)=>{
   const tx=db.transaction('deletions','readwrite');tx.objectStore('deletions').add(record);
   tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(Error('Chưa lưu được bản khôi phục. Đã giữ nguyên câu hỏi, không xóa.'));
  });return record;
 }
 async function list(){const db=await open();return new Promise((resolve,reject)=>{
  const request=db.transaction('deletions').objectStore('deletions').getAll();
  request.onsuccess=()=>resolve(request.result.sort((a,b)=>b.createdAt-a.createdAt));
  request.onerror=()=>reject(Error('Chưa đọc được các bản khôi phục. Hãy thử lại.'));
 })}
 return {archive,list};
}

export async function deleteQuestionsSafely({getBank,setBank,select,label,confirm,archive,canChange=()=>true}){
 const original=getBank(),fingerprint=JSON.stringify(original),questions=original.filter(select);
 if(!questions.length||!canChange())return false;
 if(!await confirm(questions,label))return false;
 if(getBank()!==original||JSON.stringify(original)!==fingerprint||!canChange())throw Error('Thư viện vừa thay đổi. Hãy chọn lại môn cần xóa.');
 await archive(questions,label);
 if(getBank()!==original||JSON.stringify(original)!==fingerprint||!canChange())throw Error('Thư viện vừa thay đổi. Chưa xóa câu hỏi.');
 const keys=new Set(questions.map(bankQuestionKey));
 if(!await setBank(original.filter(q=>!keys.has(bankQuestionKey(q)))))throw Error('Chưa lưu được thay đổi. Bản khôi phục vẫn được giữ.');
 return true;
}

export function recoverableQuestions(bank,candidates){
 const keys=new Set(bank.map(bankQuestionKey));
 return mergeQuestionBanks([],candidates.filter(q=>q&&typeof q.id==='string'&&typeof q.stem==='string'&&Array.isArray(q.options)&&typeof q.answer==='string'))
  .filter(q=>!keys.has(bankQuestionKey(q)));
}
