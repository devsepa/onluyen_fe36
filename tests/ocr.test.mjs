import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWithOcr,cacheKey,directImageUrl} from '../dist/ocr.mjs';

const shape=(text)=>({shape:{text:{textElements:[{textRun:{content:text}}]}}});
const imageSlide=(id,answer='B')=>({objectId:id,pageElements:[{image:{contentUrl:'https://google.example/temporary'}},shape('Slide watermark')],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'note'},pageElements:[{objectId:'note',...shape(answer)}]}}});
const makePresentation=()=>({presentationId:'private-id',title:'Private Slides',slides:[{objectId:'native',pageElements:[shape('Native question?\nA. One\nB. Two')]},imageSlide('image'),{objectId:'intro',pageElements:[shape('Introduction')]}]});
test('OCRs only unresolved image pages, preserves notes, source URL, page number and native questions',async()=>{
 const p=makePresentation(),calls=[],progress=[];
 const parsed=await parseWithOcr(p,{},{request:async url=>{calls.push(url);return{contentUrl:'https://google.example/image'}},recognize:async url=>{assert.equal(url,'https://google.example/image');return {text:'Image question?\nA. First\nB. Second',confidence:89}},onProgress:x=>progress.push(x)});
 assert.equal(calls.length,1);assert.ok(calls[0].includes('/pages/image/thumbnail?'));
 assert.equal(parsed.questions.length,2);assert.equal(parsed.questions[1].answer,'B');assert.equal(parsed.questions[1].slide,2);assert.equal(parsed.questions[1].extraction,'ocr');assert.equal(parsed.questions[1].verified,false);assert.ok(parsed.questions[1].url.endsWith('id.image'));assert.deepEqual(parsed.skipped,[3]);assert.equal(progress.at(-1).done,true);
});
test('reuses cached OCR without fetching a signed image and invalidates on modified time',async()=>{
 const p={presentationId:'private',slides:[imageSlide('s')]},map=new Map();let reads=0;
 const cache={get:async key=>map.get(key),put:async(key,v)=>map.set(key,v)};
 const opts={cache,request:async()=>{reads++;return{contentUrl:'https://google.example/image'}},recognize:async()=>({text:'Q?\nA. One\nB. Two',confidence:90})};
 await parseWithOcr(p,{modifiedTime:'2026-01-01'},opts);const again=await parseWithOcr(p,{modifiedTime:'2026-01-01'},opts);
 assert.equal(reads,1);assert.equal(again.diagnostics.ocrCached,1);
 await parseWithOcr(p,{modifiedTime:'2026-01-02'},opts);assert.equal(reads,2);
 assert.equal(await cacheKey(p,p.slides[0],{}),null);
 assert.ok(!JSON.stringify([...map]).includes('google.example'));
});
test('records per-page OCR failures without guessing questions or losing successful pages',async()=>{
 const p={presentationId:'p',slides:[imageSlide('bad'),imageSlide('good','')]};
 const result=await parseWithOcr(p,{}, {request:async url=>{if(url.includes('/bad/'))throw Error('Cannot download');return{contentUrl:'ok'}},recognize:async()=>({text:'Q?\nA. One\nB. Two',confidence:70})});
 assert.equal(result.questions.length,1);assert.equal(result.questions[0].answer,'');assert.equal(result.diagnostics.ocrErrors,1);assert.deepEqual(result.skipped,[1]);
});
test('cancelled imports stop before another page and never produce a replacement bank',async()=>{
 const controller=new AbortController();let reads=0;
 await assert.rejects(()=>parseWithOcr({presentationId:'p',slides:[imageSlide('s1'),imageSlide('s2')]},{},{signal:controller.signal,request:async()=>{reads++;return{contentUrl:'image'}},recognize:async()=>{controller.abort();return{text:'Q?\nA. One\nB. Two'}}}),{name:'AbortError'});
 assert.equal(reads,1);
});
test('unavailable OCR engine aborts the file rather than trying every page',async()=>{
 let attempts=0;await assert.rejects(()=>parseWithOcr({presentationId:'p',slides:[imageSlide('s1'),imageSlide('s2')]},{},{request:async()=>({contentUrl:'image'}),recognize:async()=>{attempts++;throw Object.assign(Error('Engine unavailable'),{ocrFatal:true})}}),/Engine unavailable/);assert.equal(attempts,1);
});
test('browser cancellation rejects even if the terminated worker never resolves recognition',async()=>{
 const {createBrowserRecognizer}=await import('../dist/ocr-browser.js');
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
 let terminated=0,markStarted;const started=new Promise(resolve=>{markStarted=resolve});
 globalThis.window={Tesseract:{createWorker:async()=>({recognize:()=>{markStarted();return new Promise(()=>{})},terminate:async()=>{terminated++}})}};
 globalThis.fetch=async(url,options)=>{assert.equal(options.credentials,'omit');assert.equal(options.headers,undefined);return {ok:true,blob:async()=>new Blob(['image'])}};
 const recognizer=createBrowserRecognizer(),controller=new AbortController();
 try{
  const result=recognizer.recognize('https://google.example/image',controller.signal);await started;controller.abort();await assert.rejects(()=>result,{name:'AbortError'});await recognizer.terminate();assert.equal(terminated,1);
 }finally{globalThis.fetch=oldFetch;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;}
});
test('direct image slides avoid thumbnail calls and stop at the requested question count',async()=>{
 const p={presentationId:'p',slides:Array.from({length:6},(_,i)=>({...imageSlide('s'+i),pageElements:[{image:{contentUrl:'direct'}}]}))};let thumbnails=0,recognized=0;
 const result=await parseWithOcr(p,{}, {maxQuestions:2,request:async()=>{thumbnails++;throw Error('Unexpected thumbnail')},recognize:async()=>{recognized++;return{text:'Q?\nA. One\nB. Two',confidence:95}}});
 assert.equal(thumbnails,0);assert.equal(recognized,2);assert.equal(result.questions.length,2);assert.equal(result.diagnostics.ocrRemaining,4);
});
test('parallel OCR uses bounded concurrency and returns questions in slide order',async()=>{
 const p={presentationId:'p',slides:Array.from({length:6},(_,i)=>imageSlide('s'+i))};let active=0,peak=0;
 const result=await parseWithOcr(p,{}, {concurrency:2,request:async()=>({contentUrl:'image'}),recognize:async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return{text:'Q?\nA. One\nB. Two'}}});
 assert.equal(peak,2);assert.deepEqual(result.questions.map(q=>q.slide),[1,2,3,4,5,6]);
});
test('selected slide ranges and using ready questions do not scan the remaining document',async()=>{
 const p={presentationId:'p',slides:Array.from({length:10},(_,i)=>imageSlide('s'+i))};let stop=false;
 const result=await parseWithOcr(p,{}, {startSlide:4,endSlide:8,shouldStop:()=>stop,request:async()=>({contentUrl:'image'}),recognize:async()=>{stop=true;return{text:'Q?\nA. One\nB. Two'}}});
 assert.deepEqual(result.questions.map(q=>q.slide),[4]);assert.equal(result.diagnostics.ocrRemaining,4);assert.deepEqual(result.skipped,[]);
});
test('direct image detection supports groups and zero crop defaults but preserves composed layouts',()=>{
 const image={image:{contentUrl:'direct',imageProperties:{cropProperties:{leftOffset:0,rightOffset:0,angle:0}}}};
 assert.equal(directImageUrl({pageElements:[{elementGroup:{children:[image]}}]}),'direct');
 assert.equal(directImageUrl({pageElements:[image,shape('Question outside the image')]}),null);
 assert.equal(directImageUrl({pageElements:[{image:{...image.image,imageProperties:{cropProperties:{leftOffset:0.5}}}}]}),null);
 assert.equal(directImageUrl({pageElements:[image,image]}),null);
});
