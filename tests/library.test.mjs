import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateLibraryQuestions,sha256,libraryBaseline,mergePrivateLibrary,createBankTracker} from '../dist/library-data.mjs';
import {createCompleteBackup,readCompleteBackup} from '../dist/library-backup.mjs';
import {readBackupZip,writeBackupZip} from '../dist/backup-zip.mjs';
import {bankQuestionKey} from '../dist/bank-merge.mjs';
import {PrivateLibrary,privateLibraryRoute,verifyPrivateIdentity} from '../backend/private-library.mjs';
import {GOOGLE_CLIENT_ID} from '../dist/site-config.mjs';
import {createLibrarySync} from '../dist/library-sync.mjs';
import {explanationKey} from '../dist/explanation-data.mjs';
import {detectSlideBorders} from '../dist/slide-fit.mjs';
const png=new Uint8Array(await readFile(new URL('./fixtures/vision-smoke.png',import.meta.url))),image=new Blob([png],{type:'image/png'}),mediaId=await sha256(png);
const q=(source='DBI202',index=1)=>({id:source+index,sourceId:source,sourceName:source,slide:index,url:`https://docs.google.com/presentation/d/${source}/edit#slide=id.p${index}`,stem:'正しい答えを選んでください。',content:'SELECT * FROM table WHERE x <> 2;',options:[{id:'A',text:'と / と'},{id:'B',text:'や / など'}],answer:'A',answerSource:'manual',verified:true,explanation:'日本語と SQL の記号 <> を保持する。'});
function memoryMedia(){const blobs=new Map();return {blobs,async get(id){return blobs.get(id)||null},async put(blob,expected){const id=await sha256(new Uint8Array(await blob.arrayBuffer()));if(expected&&id!==expected)throw Error('hash mismatch');blobs.set(id,blob);return id},async persist(){return true},async link(){}}}
class Memory{constructor(){this.data=new Map()}async get(key){return Array.isArray(key)?new Map(key.filter(k=>this.data.has(k)).map(k=>[k,structuredClone(this.data.get(k))])):structuredClone(this.data.get(key))}async put(key,value){for(const [k,v]of typeof key==='string'?[[key,value]]:Object.entries(key))this.data.set(k,structuredClone(v))}async list({prefix=''}={}){return new Map([...this.data].filter(([key])=>key.startsWith(prefix)))}async delete(key){this.data.delete(key)}async transaction(fn){return fn(this)}}
const call=(store,path,method='GET',body)=>store.fetch(new Request('https://internal'+path,{method,...(body!==undefined?{body:body instanceof Blob?body:JSON.stringify(body)}:{})}));
test('complete backup round trips original bytes, long Unicode notes, choices and structured AI data',async()=>{
 const question=q();question.explanation+='\n'.repeat(21000);const details={answer:'A',reason:'Giải thích',options:[{id:'A',text:'と / と',reason:'Đúng'},{id:'B',text:'や / など',reason:'Không đúng'}],key:explanationKey(question)};
 const backup=await createCompleteBackup([question],{media:memoryMedia(),getBlob:async()=>image,getDetails:()=>details});
 const restored=await readCompleteBackup(backup.blob);assert.equal(restored.questions[0].explanation,question.explanation);assert.equal(restored.questions[0].options[0].text,'と / と');assert.equal(restored.questions[0].explanationDetails.options[1].reason,'Không đúng');assert.deepEqual(new Uint8Array(await restored.images.get(mediaId).arrayBuffer()),png);assert.equal(question.mediaId,undefined);
});
test('backup refuses missing images and corruption instead of producing a partial successful restore',async()=>{
 await assert.rejects(()=>createCompleteBackup([q()],{media:memoryMedia(),getBlob:async()=>{throw Error('Deleted source')}}),/Chưa tạo bản sao lưu thiếu ảnh/);
 const backup=await createCompleteBackup([q()],{media:memoryMedia(),getBlob:async()=>image}),files=readBackupZip(await backup.blob.arrayBuffer());files.delete('images/'+mediaId);await assert.rejects(()=>readCompleteBackup(writeBackupZip(files)));
 const bytes=new Uint8Array(await backup.blob.arrayBuffer());bytes[100]^=1;assert.throws(()=>readBackupZip(bytes.buffer));
 assert.throws(()=>readBackupZip(new ArrayBuffer(20)));assert.throws(()=>readBackupZip(new Uint8Array(300).buffer,{maxBytes:50}));
});
test('backup rejects traversal paths and unsupported compression',async()=>{
 const malicious=writeBackupZip(new Map([['../manifest.json','{}']]));
 assert.throws(()=>readBackupZip(new Uint8Array([1,2,3]).buffer));
 await assert.rejects(async()=>readBackupZip(await malicious.arrayBuffer()),/Tên tệp/);
 const zip=new Uint8Array(await writeBackupZip(new Map([['manifest.json','{}']])).arrayBuffer());new DataView(zip.buffer).setUint16(8,8,true);assert.throws(()=>readBackupZip(zip.buffer),/khớp|hỗ trợ/);
});
test('sanitization excludes tokens and emails, preserves original language and rejects foreign sources',()=>{
 const result=validateLibraryQuestions([{...q(),token:'secret',email:'private',explanation:'長い説明'.repeat(7000)}])[0];assert.equal(result.token,undefined);assert.equal(result.email,undefined);assert.equal(result.explanation.length,28000);assert.throws(()=>validateLibraryQuestions([{...q(),url:'https://evil.test/'}]));assert.throws(()=>validateLibraryQuestions([{...q(),answer:'C'}]));
});
test('three-way merge joins subjects, preserves disjoint edits and propagates only observed deletions',async()=>{
 const original=validateLibraryQuestions([q(),q('JPD113')]),baseline=await libraryBaseline(original),local=[{...original[0],answer:'B'},original[1]],remote=[original[0],{...original[1],explanation:'Remote edit'},...validateLibraryQuestions([q('PRN212')])];
 const merged=await mergePrivateLibrary({local,remote,baseline});assert.equal(merged.conflicts.length,0);assert.equal(merged.questions.length,3);assert.equal(merged.questions[0].answer,'B');assert.equal(merged.questions[1].explanation,'Remote edit');
 const deletion=await mergePrivateLibrary({local:[original[1]],remote:original,baseline});assert.equal(deletion.questions.length,1);assert.ok(deletion.deleted.includes(bankQuestionKey(original[0])));
 const bothDeleted=await mergePrivateLibrary({local:[],remote:[],baseline,deleted:original.map(bankQuestionKey)});assert.equal(bothDeleted.conflicts.length,0);
});
test('conflicting edits/deletion are explicit and policy resolves the same concrete question',async()=>{
 const original=validateLibraryQuestions([q()]),baseline=await libraryBaseline(original),local=[{...original[0],answer:'B'}],remote=[{...original[0],explanation:'Edited remotely'}];
 const conflict=await mergePrivateLibrary({local,remote,baseline});assert.equal(conflict.conflicts.length,1);
 assert.equal((await mergePrivateLibrary({local,remote,baseline,policy:'local'})).questions[0].answer,'B');assert.equal((await mergePrivateLibrary({local,remote,baseline,policy:'remote'})).questions[0].explanation,'Edited remotely');
 assert.equal((await mergePrivateLibrary({local:[],remote,baseline})).conflicts.length,1);
});
test('dates change only for meaningful edits and do not affect sync baselines',async()=>{
 const tracker=createBankTracker(),questions=[q()];tracker.stamp(questions,100);assert.equal(questions[0].savedAt,100);tracker.stamp(questions,200);assert.equal(questions[0].updatedAt,100);const before=await libraryBaseline(questions);questions[0].answer='B';tracker.stamp(questions,300);assert.equal(questions[0].updatedAt,300);assert.notDeepEqual(await libraryBaseline(questions),before);
});
test('private storage enforces complete images, optimistic revisions and garbage-collects removed images',async()=>{
 const memory=new Memory(),store=new PrivateLibrary({storage:memory}),questions=validateLibraryQuestions([{...q(),mediaId}]);
 assert.equal((await call(store,'/manifest','PUT',{revision:0,questions,deleted:[]})).status,412);
 assert.equal((await call(store,'/media/'+mediaId,'PUT',image)).status,200);
 assert.equal((await call(store,'/manifest','PUT',{revision:0,questions,deleted:[]})).status,200);
 assert.equal((await call(store,'/manifest','PUT',{revision:0,questions:[],deleted:[]})).status,409);
 assert.deepEqual(new Uint8Array(await(await call(store,'/media/'+mediaId)).arrayBuffer()),png);
 assert.equal((await call(store,'/manifest','PUT',{revision:1,questions:[],deleted:[bankQuestionKey(questions[0])]})).status,200);assert.equal((await call(store,'/media/'+mediaId)).status,404);assert.equal(memory.data.get('usage'),0);
});
test('private route rejects guests and isolates different Google identities without storing tokens',async()=>{
 const old=globalThis.fetch,instances=new Map();const env={PRIVATE_LIBRARY:{idFromName:key=>key,get:key=>{if(!instances.has(key))instances.set(key,new PrivateLibrary({storage:new Memory()}));return instances.get(key)}}};
 try{globalThis.fetch=async(url,init)=>String(url).includes('tokeninfo')?Response.json({aud:GOOGLE_CLIENT_ID,expires_in:3600,sub:new URLSearchParams(init.body).get('access_token')==='alice'?'alice-sub':'bob-sub'}):Response.json({sub:init.headers.Authorization==='Bearer alice'?'alice-sub':'bob-sub'});
  const request=(token,path,method='GET',body)=>new Request('https://worker/v1/library'+path,{method,headers:{Authorization:token?'Bearer '+token:'','Content-Type':'application/json','X-Owner':'forged'},...(body!==undefined?{body:body instanceof Blob?body:JSON.stringify(body)}:{})});
  assert.equal((await privateLibraryRoute(request(null,'/manifest'),env,{})).status,401);assert.equal(instances.size,0);
  assert.equal((await privateLibraryRoute(request('alice','/media/'+mediaId,'PUT',image),env,{})).status,200);
  const bob=await privateLibraryRoute(request('bob','/media/'+mediaId),env,{});assert.equal(bob.status,404);assert.match(bob.headers.get('Cache-Control'),/private.*no-store/);assert.equal(instances.size,2);
  const stored=JSON.stringify([...instances.values()].flatMap(store=>[...store.storage.data]));assert.ok(!stored.includes('Bearer alice')&&!stored.includes('alice-sub'));
 }finally{globalThis.fetch=old}
});
test('private identity rejects tokens for a different OAuth application and does not put tokens in URLs',async()=>{
 await assert.rejects(()=>verifyPrivateIdentity('Bearer wrong-client','expected-app',async(url,init)=>{assert.ok(!String(url).includes('wrong-client'));assert.equal(init.method,'POST');return Response.json({aud:'other-app',expires_in:3600})}),error=>error.status===401);
});
test('large image inventories respect the Durable Object 128-key batch limit',async()=>{
 const memory=new Memory(),get=memory.get.bind(memory);memory.get=keys=>{if(Array.isArray(keys))assert.ok(keys.length<=128);return get(keys)};const store=new PrivateLibrary({storage:memory}),ids=Array.from({length:500},(_,i)=>i.toString(16).padStart(64,'0'));const response=await call(store,'/media/check','POST',{ids});assert.equal(response.status,200);assert.equal((await response.json()).missing.length,500);
});
test('two devices synchronize full images, merge additional subjects and propagate a course deletion',async()=>{
 const store=new PrivateLibrary({storage:new Memory()}),remote=async(url,init)=>store.fetch(new Request('https://private'+new URL(url).pathname.replace('/v1/library',''),init));
 function device(initial){let bank=initial,generation=0;const memory=memoryMedia(),settings=new Map();const client=createLibrarySync({base:'https://sync.test',getToken:()=> 'test',getQuestions:()=>bank,applyQuestions:next=>{bank=next;generation++;return true},getGeneration:()=>generation,media:memory,getBlob:async()=>image,storage:{getItem:k=>settings.get(k),setItem:(k,v)=>settings.set(k,v)},fetcher:remote});client.account({email:'same@example.com'});return{client,memory,get bank(){return bank},edit(next){bank=next;generation++}}}
 const a=device([q()]),b=device([q('JPD113')]);await a.client.sync();await b.client.sync();assert.equal(b.bank.length,2);assert.ok(await b.memory.get(mediaId));await a.client.sync();assert.equal(a.bank.length,2);
 a.edit(a.bank.filter(item=>item.sourceName!=='DBI202'));await a.client.sync();await b.client.sync();assert.equal(b.bank.length,1);assert.equal(b.bank[0].sourceName,'JPD113');a.client.cancel();b.client.cancel();
});
test('failed sync upload retains the old local bank and does not publish a partial cloud manifest',async()=>{
 const original=[q()],store=new PrivateLibrary({storage:new Memory()});let applied=false;
 const client=createLibrarySync({base:'https://sync.test',getToken:()=> 'test',getQuestions:()=>original,applyQuestions:()=>{applied=true;return true},media:memoryMedia(),getBlob:async()=>image,storage:{getItem:()=>null,setItem(){}},fetcher:async(url,init)=>{if(init.method==='PUT'&&new URL(url).pathname.includes('/media/'))throw Error('Offline');return store.fetch(new Request('https://private'+new URL(url).pathname.replace('/v1/library',''),init))}});client.account({email:'same@example.com'});await assert.rejects(()=>client.sync(),/Offline/);assert.equal(applied,false);assert.equal(original[0].mediaId,undefined);assert.equal((await(await call(store,'/manifest')).json()).revision,0);client.cancel();
});
test('unchanged device syncs do not continually create new cloud revisions',async()=>{
 const store=new PrivateLibrary({storage:new Memory()}),settings=new Map();let bank=[q()];const client=createLibrarySync({base:'https://sync.test',getToken:()=> 'test',getQuestions:()=>bank,applyQuestions:next=>{bank=next;return true},media:memoryMedia(),getBlob:async()=>image,storage:{getItem:k=>settings.get(k),setItem:(k,v)=>settings.set(k,v)},fetcher:(url,init)=>store.fetch(new Request('https://private'+new URL(url).pathname.replace('/v1/library',''),init))});client.account({email:'same@example.com'});await client.sync();await client.sync();await client.sync({onlyIfRemoteChanged:true});assert.equal((await(await call(store,'/status')).json()).revision,1);client.cancel();
});
test('a local edit during upload is re-read instead of being overwritten by an older captured bank',async()=>{
 const store=new PrivateLibrary({storage:new Memory()}),settings=new Map();let bank=[q()],generation=0,release,started;const waiting=new Promise(r=>started=r);let first=true;
 const client=createLibrarySync({base:'https://sync.test',getToken:()=> 'test',getQuestions:()=>bank,getGeneration:()=>generation,applyQuestions:next=>{bank=next;generation++;return true},media:memoryMedia(),getBlob:async()=>{if(first){first=false;started();await new Promise(r=>release=r)}return image},storage:{getItem:k=>settings.get(k),setItem:(k,v)=>settings.set(k,v)},fetcher:(url,init)=>store.fetch(new Request('https://private'+new URL(url).pathname.replace('/v1/library',''),init))});client.account({email:'same@example.com'});const syncing=client.sync();await waiting;bank=[q('PRN212')];generation++;release();await syncing;assert.equal(bank.length,1);assert.equal(bank[0].sourceName,'PRN212');client.cancel();
});
test('changing accounts during a pending image read prevents the old library from uploading to the new account',async()=>{
 let release,started,calls=0;const waiting=new Promise(r=>started=r),client=createLibrarySync({base:'https://sync.test',getToken:()=> 'new-account',getQuestions:()=>[q()],applyQuestions:()=>assert.fail('must not apply a canceled sync'),media:memoryMedia(),getBlob:async()=>{started();await new Promise(r=>release=r);return image},storage:{getItem:()=>null,setItem(){}},fetcher:()=>{calls++;throw Error('Unexpected upload')}});client.account({email:'old@example.com'});const syncing=client.sync();await waiting;client.account({email:'new@example.com'});release();assert.equal(await syncing,false);assert.equal(calls,0);client.cancel();
});
test('border detection trims only nearly uniform dark bands around a white slide',()=>{
 const width=100,height=100,data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=y<10||y>=90?25:255;data[i+3]=255}assert.deepEqual(detectSlideBorders(data,width,height),{top:.1,bottom:.1});
 data.fill(255);assert.deepEqual(detectSlideBorders(data,width,height),{top:0,bottom:0});for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=20;data[i+3]=255}assert.deepEqual(detectSlideBorders(data,width,height),{top:0,bottom:0});
});
