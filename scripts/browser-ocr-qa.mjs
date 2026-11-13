import assert from 'node:assert/strict';
const pages=await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://localhost:8080/'));
if(!page)throw Error('Start the isolated QA browser first.');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
console.log('Testing real browser OCR on four generated English question images…');
const expression=`(async()=>{
 const {parseWithOcr}=await import('./ocr.mjs');const {createBrowserPool}=await import('./ocr-browser.js');
 const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=700;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1400,700);ctx.fillStyle='black';ctx.font='34px Arial';
 ['Which clause filters groups after aggregation?','A. WHERE','B. HAVING','C. ORDER BY','D. SELECT'].forEach((text,i)=>ctx.fillText(text,60,100+i*90));
 const image=canvas.toDataURL('image/png');const pool=createBrowserPool({size:2,language:'eng'});const start=performance.now();
 const presentation={presentationId:'qa_ocr',slides:Array.from({length:4},(_,i)=>({objectId:'image_'+i,pageElements:[{image:{contentUrl:image}}],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'note'},pageElements:[{objectId:'note',shape:{text:{textElements:[{textRun:{content:'B'}}]}}}]}}}))};
 let apiRequests=0;
 try{const result=await parseWithOcr(presentation,{}, {concurrency:2,request:async()=>{apiRequests++;throw Error('Direct images must not use thumbnails')},recognize:(url,signal)=>pool.recognize(url,signal)});return {seconds:Math.round((performance.now()-start)/100)/10,questions:result.questions.length,answers:result.questions.map(q=>q.answer),apiRequests,errors:result.diagnostics.pages.filter(p=>p.ocrError).map(p=>p.ocrError),preview:result.diagnostics.pages[0].preview}}
 finally{await pool.terminate()}
})()`;
const result=await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('Browser OCR QA exceeded 90 seconds')),90000);
 ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id===1){clearTimeout(timer);m.result?.exceptionDetails?reject(Error(m.result.exceptionDetails.exception?.description||'Browser error')):resolve(m.result?.result?.value)}};
 ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
});
ws.close();console.log(JSON.stringify(result));assert.equal(result.questions,4);assert.deepEqual(result.answers,['B','B','B','B']);assert.equal(result.apiRequests,0);
