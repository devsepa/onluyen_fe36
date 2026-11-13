import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SLIDES_MIME,isSuggestedResource,suggestedResources,presentationIdFromLink,listSlides,readSelectedResources} from '../dist/resources.mjs';

test('recognizes resource names from the requested collection',()=>{
 for(const name of ['SEMESTER_2_MAD101_ForU','SEMETER_2','Sever_2_SEMESTER_1_CSI','Sever 1 SEMESTER 3 DBI202','semester-2','semeter 2'])assert.equal(isSuggestedResource(name),true,name);
 for(const name of ['07-Inheritance.pptx','Counting','MySever_2','SEMESTER_notes','SEMESTER_2extra','observer_2'])assert.equal(isSuggestedResource(name),false,name);
});
test('suggestions exclude unrelated presentations, PowerPoint and trashed files',()=>{
 const file={id:'1',name:'SEMESTER_2',mimeType:SLIDES_MIME};
 assert.deepEqual(suggestedResources([file,{...file,id:'2',name:'Java basics'},{...file,id:'3',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation'},{...file,id:'4',trashed:true}]),[file]);
});
test('lists all result pages, including empty intermediate pages, with Slides-only metadata',async()=>{
 const calls=[];
 const result=await listSlides(async url=>{
  const u=new URL(url);calls.push(u);
  assert.equal(u.searchParams.get('q'),`trashed = false and mimeType = '${SLIDES_MIME}'`);
  assert.equal(u.searchParams.get('includeItemsFromAllDrives'),'true');
  assert.equal(u.searchParams.has('pageToken'),calls.length>1);
  if(calls.length===1)return {files:[],nextPageToken:'next'};
  assert.equal(u.searchParams.get('pageToken'),'next');
  return {files:[{id:'a',name:'SEMESTER_2',mimeType:SLIDES_MIME},{id:'a',name:'SEMESTER_2',mimeType:SLIDES_MIME},{id:'ppt',mimeType:'other'}]};
 });
 assert.equal(calls.length,2);assert.equal(result.length,1);assert.equal(result[0].id,'a');
});
test('incomplete search is not incorrectly reported as no matching files',async()=>{
 await assert.rejects(()=>listSlides(async()=>({incompleteSearch:true,files:[]})),/chưa tìm đủ/);
});
test('reads only selected resources, deduplicates and preserves per-question provenance',async()=>{
 const selected=[{id:'chosen',name:'SEMESTER_2'},{id:'fallback',name:'Selected manually'},{id:'chosen',name:'Duplicate'}],calls=[];
 const result=await readSelectedResources(selected,async url=>{calls.push(url);const id=url.split('/').at(-1);return {presentationId:id,title:id,slides:[]}},()=>({questions:[{id:'q',stem:'Q'}],skipped:[2]}));
 assert.equal(calls.length,2);assert.ok(calls[0].endsWith('/chosen'));assert.ok(calls[1].endsWith('/fallback'));
 assert.deepEqual(result.questions.map(q=>q.sourceId),['chosen','fallback']);assert.equal(result.sources[0].count,1);assert.deepEqual(result.sources[0].skipped,[2]);
});
test('returns individual file errors without inventing questions or losing other sources',async()=>{
 const result=await readSelectedResources([{id:'denied',name:'Denied'},{id:'ok',name:'Good'}],async url=>{if(url.endsWith('/denied'))throw Error('No permission');return {presentationId:'ok'}},()=>({questions:[{id:'q'}],skipped:[]}));
 assert.equal(result.failures.length,1);assert.equal(result.failures[0].error,'No permission');assert.equal(result.sources.length,1);assert.equal(result.questions[0].sourceId,'ok');
});
test('rejects malformed or foreign links and accepts a private Slides link',()=>{
 assert.equal(presentationIdFromLink('https://docs.google.com/presentation/d/abc-123/edit#slide=id.x'),'abc-123');
 for(const value of ['https://docs.google.com.evil/presentation/d/abc','https://example.com/presentation/d/abc','http://docs.google.com/presentation/d/abc','javascript:alert(1)','https://docs.google.com/presentation/'])assert.equal(presentationIdFromLink(value),null);
});
test('does not accept content returned for another file or empty question banks',async()=>{
 const result=await readSelectedResources([{id:'a',name:'Wrong ID'},{id:'b',name:'No questions'}],async url=>({presentationId:url.endsWith('/a')?'different':'b'}),()=>({questions:[],skipped:[1]}));
 assert.equal(result.questions.length,0);assert.equal(result.sources.length,0);assert.equal(result.failures.length,2);
});
