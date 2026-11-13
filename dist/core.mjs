export function normalizeSlideText(text){return String(text).normalize('NFKC').replace(/\r\n?|\v|\f|\u2028|\u2029/g,'\n').replace(/\u00a0/g,' ').replace(/[\u200b\ufeff]/g,'').trim();}
export function cleanSlideContent(value){
 const text=normalizeSlideText(value);let folded='',position=0;const starts=[],ends=[];
 for(const char of text){
  const ascii=char.normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/gi,'d').toLowerCase();
  for(let i=0;i<ascii.length;i++){starts.push(position);ends.push(position+char.length)}
  folded+=ascii;position+=char.length;
 }
 // OCR may read Source as Sourge/S0urce and Buôn as Buén. Require the full
 // repeated-name signature before fuzzy matching, never remove ordinary "source".
 const distance=(a,b)=>{let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next}return row[b.length]};
 const tokens=[...folded.matchAll(/[a-z0-9]+/g)],matches=[];
 for(let i=0;i+3<tokens.length;i++){
  const group=tokens.slice(i,i+4),words=group.map(t=>t[0]);
  if(distance(words[0],'hoang')>1||distance(words[1],'hoang')>1||!['buon','buen','bun'].some(w=>distance(words[2],w)<=1)||distance(words[3],'source')>2)continue;
  if(group.slice(1).some((t,j)=>! /^[\s_.-]+$/.test(folded.slice(group[j].index+group[j][0].length,t.index))))continue;
  const index=group[0].index,end=group[3].index+group[3][0].length;matches.push({index,0:folded.slice(index,end)});i+=3;
 }
 let result=text;
 for(const match of matches.reverse()){
  let start=starts[match.index];const end=ends[match.index+match[0].length-1];
  const lineStart=text.lastIndexOf('\n',start-1)+1,before=text.slice(lineStart,start);
  const prefix=before.match(/[ \t]*[©®@•📍][ \t]*$/u);if(prefix)start-=prefix[0].length;
  result=result.slice(0,start)+result.slice(end);
 }
 return result.split('\n').filter(line=>! /^(?:[©®@•📍\s]*|F\s*O\s*R\s*U|LEARN\s+TO\s+KNOW)$/i.test(line.trim())).join('\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
export function cleanQuestion(q){
 const answer=normalizeAnswer(q.answer,q.options);
 return {...q,answer,verified:!!answer&&q.verified===true,explanation:q.answerSource==='gemini'?q.explanation:'',stem:cleanSlideContent(q.stem),options:[...q.options].sort((a,b)=>a.id.localeCompare(b.id)).map(o=>({...o,text:cleanSlideContent(o.text)}))};
}
export function normalizeAnswer(value,options){
 if(typeof value!=='string'||! /^[A-H](?:[A-H]|[\s,;/&+]+[A-H])*$/i.test(value.trim()))return '';
 const ids=[...new Set(value.toUpperCase().match(/[A-H]/g))].sort();
 return ids.every(id=>options.some(o=>o.id===id))?ids.join(''):'';
}
export function isCorrect(question,selection){const answer=normalizeAnswer(question.answer,question.options);return !!answer&&normalizeAnswer(selection,question.options)===answer}
export function textOf(elements=[]){
 const ordered=[...elements].sort((a,b)=>(a.transform?.translateY??0)-(b.transform?.translateY??0)||(a.transform?.translateX??0)-(b.transform?.translateX??0));
 return ordered.flatMap(e=>e.elementGroup?textOf(e.elementGroup.children):e.shape?[(e.shape.text?.textElements||[]).map(t=>t.textRun?.content||'').join('')]:e.table?e.table.tableRows.flatMap(r=>r.tableCells.map(c=>(c.text?.textElements||[]).map(t=>t.textRun?.content||'').join(''))):e.wordArt?[e.wordArt.renderedText||'']:[]).join('\n');
}
function optionParts(text){
 // Prefer line starts; use inline labels only when the slide has no complete line-based set.
 const patterns=[/(?:^|\n)[ \t]*(?:[•●▪][ \t]*)?(?:\(([A-Ha-h])\)|\[([A-Ha-h])\]|([A-Ha-h])[.)：:])[ \t]*/g,/(?:^|\s)(?:\(([A-Ha-h])\)|\[([A-Ha-h])\]|([A-Ha-h])[.)：:])[ \t]+/g];
 for(const pattern of patterns){
  const matches=[...text.matchAll(pattern)].map(m=>({index:m.index,end:m.index+m[0].length,id:(m[1]||m[2]||m[3]).toUpperCase()}));
  if(matches.length<2||matches[0].id!=='A'||matches.some((m,j)=>m.id!==String.fromCharCode(65+j)))continue;
  const stem=text.slice(0,matches[0].index).trim();
  const options=matches.map((m,j)=>({id:m.id,text:text.slice(m.end,matches[j+1]?.index??text.length).trim()}));
  if(stem&&options.every(o=>o.text))return {stem,options};
 }
 return null;
}
function imageCount(elements=[]){return elements.reduce((n,e)=>n+(e.image?1:0)+(e.elementGroup?imageCount(e.elementGroup.children):0),0)}
export function speakerNotesText(slide){
 const page=slide.slideProperties?.notesPage,id=page?.notesProperties?.speakerNotesObjectId;
 const flatten=items=>items.flatMap(e=>e.elementGroup?flatten(e.elementGroup.children||[]):[e]);
 const elements=flatten(page?.pageElements||[]);
 const exact=id?elements.filter(e=>e.objectId===id):[];
 const body=elements.filter(e=>e.shape?.placeholder?.type==='BODY');
 const target=exact.length?exact:body.length===1?body:[];
 return normalizeSlideText(textOf(target)).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
}
export function detailsFromNotes(slide,options){
 const lines=speakerNotesText(slide).split('\n').map(line=>line.trim()).filter(Boolean);
 const pattern=/^(?:(?:answers?|correct answers?|correct option|đáp án|đáp án đúng)\s*[:：-]?\s*)?\(?([A-H](?:[A-H]|[ ,;/&+]+[A-H])*)\)?[.)]?\s*$/i;
 const match=lines[0]?.match(pattern);
 const answer=normalizeAnswer(match?.[1],options);
 if(!answer||lines.slice(1).some(line=>{const other=line.match(pattern);return other&&normalizeAnswer(other[1],options)!==answer}))return {answer:'',explanation:''};
 return {answer,explanation:cleanSlideContent(lines.slice(1).join('\n'))};
}
export function answerFromNotes(slide,options){
 return detailsFromNotes(slide,options).answer;
}
export function parsePresentation(p){
 const questions=[],skipped=[],pages=[];
 for(const [i,s] of (p.slides||[]).entries()){
  const text=cleanSlideContent(textOf(s.pageElements)),parts=optionParts(text);
  const images=imageCount(s.pageElements)+(s.pageProperties?.pageBackgroundFill?.stretchedPictureFill?1:0);
  pages.push({slide:i+1,objectId:s.objectId,textLength:text.length,images,recognized:!!parts,preview:text.slice(0,1200)});
  if(!parts){skipped.push(i+1);continue;}
  const answer=answerFromNotes(s,parts.options);
  questions.push({id:crypto.randomUUID(),...parts,answer,explanation:'',verified:!!answer,answerSource:answer?'speaker-notes':null,slide:i+1,url:`https://docs.google.com/presentation/d/${p.presentationId}/edit#slide=id.${s.objectId}`});
 }
 return {questions,skipped,diagnostics:{totalSlides:pages.length,textSlides:pages.filter(s=>s.textLength>0).length,imageSlides:pages.filter(s=>s.images>0).length,pages}};
}
export function shuffle(values){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function grade(questions,answers){return questions.reduce((n,q)=>n+(isCorrect(q,answers[q.id])?1:0),0);}
export function answerQuestion(session,questionId,optionId,now=Date.now()){
 if(session.done||(session.mode!=='study'&&now>=session.deadline))return false;
 const question=session.questions.find(q=>q.id===questionId);
 if(!question||!question.options.some(o=>o.id===optionId)||(session.mode==='study'&&session.answers[questionId]))return false;
 if(question.answer.length>1){
  const map=session.mode==='study'?(session.drafts??={}):session.answers;
  const values=new Set(map[questionId]||'');values.has(optionId)?values.delete(optionId):values.add(optionId);
  const selected=[...values].sort().join('');if(selected)map[questionId]=selected;else delete map[questionId];
 }else session.answers[questionId]=optionId;
 return true;
}
export function confirmQuestion(session,questionId){
 const question=session.questions.find(q=>q.id===questionId);
 if(session.done||session.mode!=='study'||!question||question.answer.length<2||session.answers[questionId])return false;
 const selected=normalizeAnswer(session.drafts?.[questionId],question.options);if(!selected)return false;
 session.answers[questionId]=selected;return true;
}
export function optionState(session,question,optionId){
 const selected=session.answers[question.id];
 if(session.mode==='study'&&selected){if(question.answer.includes(optionId))return 'correct';if(selected.includes(optionId))return 'wrong';return '';}
 return (selected||session.drafts?.[question.id]||'').includes(optionId)?'selected':'';
}
