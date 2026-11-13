import assert from 'node:assert/strict';
const pages=await(await fetch('http://127.0.0.1:9223/json/list')).json(),page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080/'));
if(!page)throw Error('Start the isolated QA browser first.');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
const expression=`(async()=>{
 const {parseWithOcr}=await import('./ocr.mjs?v=20261113-jpn-19');const {createBrowserPool}=await import('./ocr-browser.js');
 const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1000;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,1800,1000);c.fillStyle='black';c.font='44px "Yu Gothic", "Meiryo", "MS Gothic", sans-serif';
 ['Chọn đáp án đúng cho câu tiếng Nhật.','このかばんは にまんよんせんはっぴゃく えんです。','A. 四千八百二万','B. 二万四八百千','C. 二八百万四千','D. 二万四千八百'].forEach((line,i)=>c.fillText(line,70,100+i*135));
 const image=canvas.toDataURL(),pool=createBrowserPool({size:1,language:'jpn+vie+eng'}),started=performance.now();
 const notes={notesProperties:{speakerNotesObjectId:'n'},pageElements:[{objectId:'n',shape:{text:{textElements:[{textRun:{content:'D\\nにまん。Hai vạn.'}}]}}}]};
 const p={presentationId:'qa_japanese',slides:[{objectId:'s',pageElements:[{image:{contentUrl:image}}],slideProperties:{notesPage:notes}}]};
 try{const result=await parseWithOcr(p,{}, {language:'jpn+vie+eng',request:async()=>{throw Error('Unexpected thumbnail')},recognize:(url,signal)=>pool.recognize(url,signal)});return{seconds:Math.round((performance.now()-started)/100)/10,questions:result.questions,preview:result.diagnostics.pages[0].preview,errors:result.diagnostics.pages.map(p=>p.ocrError).filter(Boolean)}}finally{await pool.terminate()}
})()`;
console.log('Running real Japanese/Vietnamese/English Tesseract OCR on one synthetic slide…');
try{
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Japanese OCR QA exceeded 120 seconds')),120000);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){clearTimeout(timer);m.result?.exceptionDetails?reject(Error(m.result.exceptionDetails.exception?.description||'Browser error')):resolve(m.result?.result?.value)}};ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}))});
 console.log(JSON.stringify(result));assert.equal(result.questions.length,1);const q=result.questions[0];assert.equal(q.answer,'D');assert.deepEqual(q.options.map(o=>o.id),['A','B','C','D']);assert.ok(q.stem.replace(/\s/g,'').includes('このかばん'));assert.ok(q.options[3].text.replace(/\s/g,'').includes('二万四千八百'));assert.ok(q.explanation.includes('にまん'));console.log('Japanese OCR QA passed; synthetic source only, not a guarantee for private slides.');
}finally{ws.close()}
