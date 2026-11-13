import {presentationIdFromLink} from './resources.mjs';
import {bankQuestionKey} from './bank-merge.mjs';
import {validateOptionReasons,explanationKey} from './explanation-data.mjs';
export const MAX_LIBRARY_QUESTIONS=5000,MAX_IMAGE_BYTES=2100000,MAX_LIBRARY_BYTES=200*1024*1024;
export const validMediaId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export async function sha256(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')}
export function imageMime(bytes){
 if(bytes.length>=24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return 'image/png';
 if(bytes.length>=20&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=20&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 throw Error('Ảnh trong thư viện phải là PNG, JPEG hoặc WebP hợp lệ.');
}
export function validateLibraryQuestions(input){
 if(!Array.isArray(input)||input.length>MAX_LIBRARY_QUESTIONS)throw Error('Mỗi thư viện tối đa 5.000 câu; hãy chia sao lưu theo môn.');
 const ids=new Set(),keys=new Set();
 return input.map((q,index)=>{
  const shared=/^[a-f0-9-]{36}$/.test(q?.sharedDeck)&&Number.isInteger(q.sharedIndex)&&q.sharedIndex>=0&&q.sharedIndex<500;
  const source=shared?'shared-'+q.sharedDeck:presentationIdFromLink(q?.url);
  if(!q||!source||q.sourceId!==source||typeof q.id!=='string'||!q.id||q.id.length>100||ids.has(q.id)||typeof q.stem!=='string'||!q.stem.trim()||q.stem.length>20000||!Array.isArray(q.options)||q.options.length<2||q.options.length>8)throw Error(`Câu ${index+1} trong thư viện không hợp lệ.`);
  ids.add(q.id);const labels=new Set();
  const options=q.options.map(o=>{if(!o||! /^[A-H]$/.test(o.id)||labels.has(o.id)||typeof o.text!=='string'||o.text.length>20000)throw Error('Lựa chọn trong thư viện không hợp lệ.');labels.add(o.id);return{id:o.id,text:o.text}}).sort((a,b)=>a.id.localeCompare(b.id));
  if(typeof q.answer!=='string'||(q.answer&&(! /^[A-H]{1,8}$/.test(q.answer)||new Set(q.answer).size!==q.answer.length||[...q.answer].some(id=>!labels.has(id)))))throw Error('Đáp án trong thư viện không hợp lệ.');
  const text=(key,max)=>{if(q[key]===undefined||q[key]===null)return '';if(typeof q[key]!=='string'||q[key].length>max)throw Error('Nội dung thư viện quá dài hoặc không hợp lệ.');return q[key]};
  const value={id:q.id,sourceId:source,sourceName:text('sourceName',300),sourceVersion:text('sourceVersion',300)||null,stem:q.stem,content:text('content',100000),options,answer:q.answer,verified:!!q.answer&&q.verified===true,answerSource:['manual','speaker-notes','gemini'].includes(q.answerSource)?q.answerSource:null,explanation:text('explanation',100000),explanationSource:['manual','speaker-notes','gemini'].includes(q.explanationSource)?q.explanationSource:null,extraction:q.extraction==='ocr'?'ocr':'text',slide:Number.isInteger(q.slide)&&q.slide>0?q.slide:1,url:shared?'':q.url,...(shared?{sharedDeck:q.sharedDeck,sharedIndex:q.sharedIndex}:{})};
  for(const key of ['aiStatus','aiReason','aiModel'])if(typeof q[key]==='string')value[key]=text(key,key==='aiReason'?6000:100);
  if(q.mediaId!==undefined){if(!validMediaId(q.mediaId))throw Error('Mã ảnh trong thư viện không hợp lệ.');value.mediaId=q.mediaId}
  for(const key of ['savedAt','updatedAt'])if(Number.isFinite(q[key])&&q[key]>0)value[key]=q[key];
  if(q.explanationDetails){const details=q.explanationDetails;if(details.answer===q.answer&&details.key===explanationKey(value)){if(typeof details.reason!=='string'||details.reason.length>3000)throw Error('Giải thích AI trong thư viện không hợp lệ.');value.explanationDetails={answer:details.answer,reason:details.reason,key:details.key,options:validateOptionReasons(details.options,details.options?.map(o=>o.id))}}}
  const key=bankQuestionKey(value);if(keys.has(key))throw Error('Thư viện có câu hỏi trùng slide.');keys.add(key);return value;
 });
}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])]));return value}
export function questionContent(q){const {id,savedAt,updatedAt,...content}=q;return JSON.stringify(stable(content))}
export function createBankTracker(initial=[]){let previous=new Map(initial.map(q=>[bankQuestionKey(q),{content:questionContent(q),savedAt:q.savedAt,updatedAt:q.updatedAt}]));return {stamp(questions,now=Date.now()){const next=new Map();for(const q of questions){const key=bankQuestionKey(q),old=previous.get(key),content=questionContent(q);q.savedAt=Number.isFinite(q.savedAt)&&q.savedAt>0?q.savedAt:old?.savedAt||now;q.updatedAt=old&&old.content!==content?now:q.updatedAt||old?.updatedAt||q.savedAt;next.set(key,{content,savedAt:q.savedAt,updatedAt:q.updatedAt})}previous=next;return questions}}}
export async function libraryBaseline(questions){return Object.fromEntries(await Promise.all(questions.map(async q=>[bankQuestionKey(q),await sha256(questionContent(q))])))}
export async function mergePrivateLibrary({local,remote,baseline={},deleted=[],policy}={}){
 const l=new Map(local.map(q=>[bankQuestionKey(q),q])),r=new Map(remote.map(q=>[bankQuestionKey(q),q])),lh=await libraryBaseline(local),rh=await libraryBaseline(remote),removed=new Set(deleted),questions=[],conflicts=[];
 for(const key of new Set([...l.keys(),...r.keys(),...Object.keys(baseline),...removed])){
  const left=l.get(key),right=r.get(key),base=baseline[key],localChanged=base?lh[key]!==base:!!left,remoteChanged=base?rh[key]!==base&&(!!right||removed.has(key)):!!right;
  if(!left&&!right){if(base||removed.has(key))removed.add(key);continue}
  let chosen;
  if(left&&right&&lh[key]===rh[key])chosen={...right,...left,mediaId:left.mediaId||right.mediaId};
  else if(localChanged&&remoteChanged||!base&&left&&removed.has(key)){
   conflicts.push({key,local:left||null,remote:right||null});if(!policy)continue;chosen=policy==='local'?left:right;
  }else if(localChanged)chosen=left;
  else if(remoteChanged||removed.has(key))chosen=right;
  else chosen=left||right;
  if(chosen){questions.push({...chosen,id:left?.id||chosen.id});removed.delete(key)}else if(base||removed.has(key))removed.add(key);
 }
 const ids=new Set();for(const q of questions){if(ids.has(q.id))q.id=crypto.randomUUID();ids.add(q.id)}
 return {questions,deleted:[...removed],conflicts};
}
