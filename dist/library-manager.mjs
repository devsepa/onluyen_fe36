import {practiceSubjects,subjectKey} from './subjects.mjs';
import {readyForPractice} from './ai.mjs';
import {mergeQuestionBanks} from './bank-merge.mjs';
import {createCompleteBackup,readCompleteBackup} from './library-backup.mjs';
import {createLibrarySync} from './library-sync.mjs';
import {askConfirm} from './confirm-dialog.mjs';
import {questionContent} from './library-data.mjs';
function add(parent,tag,text,className){const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;parent.append(element);return element}
function button(parent,text,fn,className='secondary'){const element=add(parent,'button',text,className);element.type='button';element.onclick=fn;return element}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function chooseConflict(conflicts,getImage){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='library-conflict-dialog';add(dialog,'h2',conflicts.length+' câu có thay đổi khác nhau');add(dialog,'p','Xem hai bản dưới đây. Lựa chọn sẽ áp dụng cho toàn bộ '+conflicts.length+' câu bị xung đột; các câu khác sẽ được hợp nhất.');
 const list=add(dialog,'div'),pager=add(dialog,'div',undefined,'row');let page=0,chosen=null;const urls=new Set();
 const prev=button(pager,'← Trước',()=>{page--;render()}),label=add(pager,'span'),next=button(pager,'Tiếp →',()=>{page++;render()});
 function render(){for(const url of urls)URL.revokeObjectURL(url);urls.clear();list.replaceChildren();
  for(const conflict of conflicts.slice(page*5,page*5+5)){const q=conflict.local||conflict.remote,article=add(list,'article');add(article,'h3',q.sourceName+' · Slide '+q.slide);const pair=add(article,'div',undefined,'library-conflict-versions');
   for(const [title,question]of [['Trên máy này',conflict.local],['Đã đồng bộ',conflict.remote]]){const details=add(pair,'details');details.open=true;add(details,'summary',title);if(!question){add(details,'p','Đã xóa câu này.');continue}
    add(details,'pre',question.stem+'\n'+question.options.map(o=>o.id+'. '+o.text).join('\n')+'\nĐáp án: '+(question.answer||'Chưa có')+'\nGiải thích: '+(question.explanation||'Chưa có'));
    if(getImage&&question.mediaId){const image=add(details,'img');image.alt='Ảnh gốc · '+title;getImage(question).then(blob=>{if(blob&&image.isConnected){const url=URL.createObjectURL(blob);urls.add(url);image.src=url}}).catch(()=>{image.alt='Chưa tải được ảnh của bản này.'})}
   }
  }
  label.textContent=(page*5+1)+'–'+Math.min(conflicts.length,(page+1)*5)+' / '+conflicts.length;prev.disabled=page===0;next.disabled=(page+1)*5>=conflicts.length;
 }
 const row=add(dialog,'div',undefined,'row');button(row,'Giữ bản trên máy',()=>{chosen='local';dialog.close()});button(row,'Dùng bản đã đồng bộ',()=>{chosen='remote';dialog.close()});button(row,'Để sau',()=>dialog.close(),'text-button');dialog.onclose=()=>{for(const url of urls)URL.revokeObjectURL(url);dialog.remove();resolve(chosen)};dialog.oncancel=()=>{chosen=null};document.body.append(dialog);render();dialog.showModal();
})}
export function setupLibraryManager({base,getBank,setBank,getGeneration,getToken,getBlob,getDetails,media,canChange,onPractice,storage=localStorage}={}){
 const root=document.getElementById('library'),panel=document.createElement('section');panel.className='card library-manager';panel.setAttribute('aria-label','Quản lý môn và đồng bộ riêng tư');root.querySelector('.section-heading').before(panel);
 const heading=add(panel,'div',undefined,'library-manager-heading');add(heading,'h2','Thư viện theo môn');const toolbar=add(heading,'div',undefined,'row');const exportAll=button(toolbar,'↓ Sao lưu trọn bộ',()=>exportQuestions(getBank(),'thu-vien'));
 const restore=button(toolbar,'↑ Khôi phục sao lưu',()=>document.getElementById('bankFile').click());
 add(panel,'p','Bản ZIP chứa câu hỏi, đáp án, giải thích và ảnh gốc. Khôi phục được cả khi nguồn cũ không còn truy cập được.','muted');
 const syncPanel=add(panel,'div',undefined,'library-sync-panel'),identity=add(syncPanel,'strong','Thư viện riêng tư'),syncText=add(syncPanel,'p','Đăng nhập Google ở ảnh đại diện để đồng bộ giữa các thiết bị.');syncText.setAttribute('role','status');
 add(syncPanel,'p','Kho riêng hỗ trợ tối đa 5.000 câu và 200 MB ảnh. Chỉ đồng bộ thư viện; bài đang làm và lịch sử vẫn lưu riêng trên thiết bị.','muted');
 const actions=add(syncPanel,'div',undefined,'row'),syncButton=button(actions,'↻ Đồng bộ ngay',()=>runSync());
 const autoLabel=add(actions,'label',undefined,'check-label');const auto=add(autoLabel,'input');auto.type='checkbox';autoLabel.append('Tự đồng bộ ảnh và nội dung vào kho riêng của tài khoản này');
 const progress=add(panel,'p','', 'library-operation-status');progress.hidden=true;progress.setAttribute('role','status');
 const stop=button(panel,'Dừng',()=>{operation?.abort();sync.cancel()},'secondary library-stop');stop.hidden=true;
 const cards=add(panel,'div',undefined,'subject-library-grid');let operation=null,profile=null;
 function status(text){progress.textContent=text;progress.hidden=!text}
 const sync=createLibrarySync({base,getToken,getQuestions:getBank,applyQuestions:questions=>setBank(questions,{sync:true}),getGeneration,media,getBlob,getDetails,storage,onConflict:(conflicts,context)=>document.body.classList.contains('quiz-active')?null:chooseConflict(conflicts,context?.getImage),onStatus:state=>{if(!state.keepText)syncText.textContent=state.text;identity.textContent=state.owner?'Kho riêng · '+state.owner:'Thư viện riêng tư';auto.checked=state.enabled;stop.hidden=!state.busy&&!operation;syncButton.disabled=state.busy||!!operation||!profile;auto.disabled=!profile||!!operation;refreshButtons()}});sync.watch();
 function busy(){return !!operation||sync.isBusy()}
 function refreshButtons(){exportAll.disabled=busy()||!getBank().length;restore.disabled=busy();for(const b of cards.querySelectorAll('button'))b.disabled=busy();syncButton.disabled=busy()||!profile}
 async function exportQuestions(questions,name){
  if(busy()||!questions.length)return;operation=new AbortController();refreshButtons();stop.hidden=false;
  try{const originals=new Map(questions.map(q=>[q.id,questionContent(q)]));await media.persist();const result=await createCompleteBackup(questions,{media,getBlob,getDetails,signal:operation.signal,onProgress:p=>status(`Đang đóng gói ${p.current}/${p.total} câu, gồm ảnh gốc…`)});operation.signal.throwIfAborted();
   const replacements=new Map(result.questions.map(q=>[q.id,q]));if(!setBank(getBank().map(q=>originals.get(q.id)===questionContent(q)?replacements.get(q.id)||q:q)))throw Error('Chưa lưu được ảnh vào thư viện trên máy.');
   download(result.blob,`${name.replace(/[^a-zA-Z0-9._-]/g,'_')}-${new Intl.DateTimeFormat('sv-SE').format(new Date())}.zip`);status(`Đã tạo sao lưu đủ ${result.questions.length} câu và ${result.images.size} ảnh. Giữ file ZIP này để khôi phục độc lập sau này.`);
  }catch(error){status(error.name==='AbortError'?'Đã dừng tạo sao lưu; thư viện cũ vẫn được giữ.':error.message)}finally{operation=null;stop.hidden=!sync.isBusy();refreshButtons()}
 }
 async function runSync(){if(busy()||!canChange())return;try{if(!profile)throw Error('Đăng nhập Google ở ảnh đại diện trước khi đồng bộ.');if(storage.getItem('sot-private-library-owner')!==profile.email?.toLowerCase()&&!await askConfirm(`Hợp nhất thư viện trên máy với kho riêng của ${profile.email}? Câu hỏi và ảnh sẽ được lưu riêng theo tài khoản này, không đăng vào Kho đề chung.`,{title:'Đồng bộ riêng tư',okText:'Đồng bộ'}))return;await sync.sync();render()}catch(error){syncText.textContent=error.message}finally{refreshButtons()}}
 auto.onchange=async()=>{if(!canChange()){auto.checked=sync.enabled;return}try{sync.setEnabled(auto.checked);if(auto.checked)await runSync()}catch(error){syncText.textContent=error.message;auto.checked=false}};
 function render(){cards.replaceChildren();const bank=getBank(),groups=practiceSubjects(bank);
  for(const group of groups){const questions=bank.filter(q=>subjectKey(q)===group.key),article=add(cards,'article',undefined,'subject-library-card');add(article,'h3',group.label);add(article,'p',`${questions.length} câu · ${questions.filter(readyForPractice).length} sẵn sàng · ${new Set(questions.map(q=>q.sourceId)).size} tài liệu`);const updated=Math.max(0,...questions.map(q=>q.updatedAt||q.savedAt||0));add(article,'small',updated?'Cập nhật: '+new Date(updated).toLocaleString('vi-VN'):'Chưa có ngày lưu');const row=add(article,'div',undefined,'row');button(row,'Ôn môn này',()=>{if(canChange())onPractice(group.key)});button(row,'Sao lưu môn',()=>exportQuestions(questions,group.label));button(row,'Xóa môn',async()=>{if(busy()||!canChange())return;if(!await askConfirm(`Xóa ${questions.length} câu của ${group.label} khỏi thư viện trên máy? Các môn khác và lịch sử bài làm vẫn giữ. Nếu đang bật đồng bộ, việc xóa sẽ được đồng bộ sang thiết bị khác.`,{title:'Xóa riêng môn',okText:'Xóa môn',danger:true}))return;if(setBank(getBank().filter(q=>subjectKey(q)!==group.key)))render()},'text-button danger')}
  if(!groups.length)add(cards,'p','Chưa có môn nào được lưu. Thêm tài liệu hoặc khôi phục bản sao lưu để bắt đầu.','muted');refreshButtons();
 }
 const originalExport=document.getElementById('exportBank').onclick,originalImport=document.getElementById('bankFile').onchange;
 const lightweight=button(document.getElementById('exportBank').parentElement,'Xuất JSON (không ảnh)',originalExport);lightweight.id='exportJsonBank';
 document.getElementById('exportBank').textContent='↓ Sao lưu cả ảnh';document.getElementById('exportBank').onclick=()=>exportQuestions(getBank(),'thu-vien');
 document.getElementById('bankFile').accept='.json,.zip,.sot,application/json,application/zip';
 document.getElementById('bankFile').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;const signature=new Uint8Array(await file.slice(0,4).arrayBuffer());if(signature[0]!==80||signature[1]!==75){await originalImport(event);return}
  try{if(busy()||!canChange())return;operation=new AbortController();refreshButtons();stop.hidden=false;status('Đang kiểm tra bản sao lưu và mã kiểm tra từng ảnh…');
   if(file.size>256*1024*1024)throw Error('File sao lưu vượt 256 MB. Hãy dùng bản sao lưu riêng từng môn.');const result=await readCompleteBackup(file);operation.signal.throwIfAborted();let count=0;for(const [id,blob]of result.images){operation.signal.throwIfAborted();await media.put(blob,id);status(`Đang giữ ảnh ${++count}/${result.images.size} trên máy…`)}for(const q of result.questions)if(q.mediaId)await media.link(q,q.mediaId);
   operation.signal.throwIfAborted();const before=getBank().length,merged=mergeQuestionBanks(getBank(),result.questions);if(!setBank(merged))throw Error('Chưa lưu được thư viện khôi phục. Dữ liệu cũ vẫn giữ.');status(`Đã khôi phục ${result.questions.length} câu và ${result.images.size} ảnh; thêm ${merged.length-before} câu mới. Các môn cũ vẫn được giữ.`);render();
  }catch(error){status(error.name==='AbortError'?'Đã dừng khôi phục; thư viện cũ vẫn được giữ.':error.message)}finally{operation=null;event.target.value='';stop.hidden=!sync.isBusy();refreshButtons()}
 };
 render();return {render,changed(){render();sync.changed()},account(value){profile=value;sync.account(value);refreshButtons()},isBusy:busy,isApplying:sync.isApplying,pause(){operation?.abort();sync.cancel()},sync};
}
