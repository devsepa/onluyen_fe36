export function normalizeSlideText(text){return String(text).normalize('NFKC').replace(/\r\n?|\v|\f|\u2028|\u2029/g,'\n').replace(/\u00a0/g,' ').replace(/[\u200b\ufeff]/g,'').trim();}
export function cleanSlideContent(value){
 const text=normalizeSlideText(value);let folded='',position=0;const starts=[],ends=[];
 for(const char of text){
  const ascii=char.normalize('NFD').replace(/\p{M}/gu,'').replace(/đ/gi,'d').toLowerCase();
  for(let i=0;i<ascii.length;i++){starts.push(position);ends.push(position+char.length)}
  folded+=ascii;position+=char.length;
 }
 const matches=[...folded.matchAll(/\bhoang[\s_-]+hoang[\s_-]+bu[oeu]?n[\s_-]+s[o0]urce\b/g)];
 let result=text;
 for(const match of matches.reverse()){
  let start=starts[match.index];const end=ends[match.index+match[0].length-1];
  const lineStart=text.lastIndexOf('\n',start-1)+1,before=text.slice(lineStart,start);
  const prefix=before.match(/[ \t]*[©®@•📍][ \t]*$/u);if(prefix)start-=prefix[0].length;
  result=result.slice(0,start)+result.slice(end);
 }
 return result.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
export function cleanQuestion(q){
 return {...q,stem:cleanSlideContent(q.stem),options:[...q.options].sort((a,b)=>a.id.localeCompare(b.id)).map(o=>({...o,text:cleanSlideContent(o.text)}))};
}
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
 const pattern=/^(?:(?:answer|correct answer|correct option|đáp án|đáp án đúng)\s*[:：-]?\s*)?\(?([A-H])\)?[.)]?\s*$/i;
 const match=lines[0]?.match(pattern);
 const answer=match?.[1].toUpperCase()||'';
 if(!options.some(o=>o.id===answer)||lines.slice(1).some(line=>{const other=line.match(pattern);return other&&other[1].toUpperCase()!==answer}))return {answer:'',explanation:''};
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
  const {answer,explanation}=detailsFromNotes(s,parts.options);
  questions.push({id:crypto.randomUUID(),...parts,answer,explanation,verified:!!answer,answerSource:answer?'speaker-notes':null,slide:i+1,url:`https://docs.google.com/presentation/d/${p.presentationId}/edit#slide=id.${s.objectId}`});
 }
 return {questions,skipped,diagnostics:{totalSlides:pages.length,textSlides:pages.filter(s=>s.textLength>0).length,imageSlides:pages.filter(s=>s.images>0).length,pages}};
}
export function shuffle(values){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function grade(questions,answers){return questions.reduce((n,q)=>n+(answers[q.id]===q.answer?1:0),0);}
export function answerQuestion(session,questionId,optionId,now=Date.now()){
 if(session.done||(session.mode!=='study'&&now>=session.deadline))return false;
 const question=session.questions.find(q=>q.id===questionId);
 if(!question||!question.options.some(o=>o.id===optionId)||(session.mode==='study'&&session.answers[questionId]))return false;
 session.answers[questionId]=optionId;return true;
}
export function optionState(session,question,optionId){
 const selected=session.answers[question.id];
 if(session.mode==='study'&&selected){if(optionId===question.answer)return 'correct';if(optionId===selected)return 'wrong';return '';}
 return selected===optionId?'selected':'';
}
