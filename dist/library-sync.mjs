import {validateLibraryQuestions,libraryBaseline,mergePrivateLibrary,validMediaId,sha256} from './library-data.mjs?v=2026.11.14.32';
import {prepareLibraryQuestions} from './library-backup.mjs?v=2026.11.14.32';
export function createLibrarySync({base,getToken,getQuestions,applyQuestions,getGeneration=()=>0,media,getBlob,getDetails,storage,onStatus=()=>{},onConflict=async()=>null,fetcher=fetch}={}){
 let owner='',controller=null,applying=false,timer,enabled=false,dirty=false;
 const stateKey=account=>'sot-private-library:'+account.toLowerCase();
 const read=()=>{try{return JSON.parse(storage.getItem(stateKey(owner)))||{}}catch{return {}}};
 const write=state=>storage.setItem(stateKey(owner),JSON.stringify(state));
 const status=(text,extra={})=>onStatus({text,busy:!!controller,enabled,owner,...extra});
 function cancel(){clearTimeout(timer);controller?.abort();enabled=false}
 function account(profile){cancel();owner=profile?.email?.toLowerCase()||'';const state=read();enabled=!!owner&&state.enabled===true&&storage.getItem('sot-private-library-owner')===owner;status(owner?(state.lastSynced?'Đồng bộ gần nhất: '+new Date(state.lastSynced).toLocaleString('vi-VN'):'Chưa đồng bộ thư viện riêng trên thiết bị này.'):'Đăng nhập Google ở ảnh đại diện để đồng bộ giữa các thiết bị.');if(enabled)changed()}
 function setEnabled(value){if(value&&!owner)throw Error('Đăng nhập Google ở ảnh đại diện trước.');enabled=value;const state=read();write({...state,enabled:value});if(value){storage.setItem('sot-private-library-owner',owner);changed()}else{clearTimeout(timer);controller?.abort()}status(value?'Đã bật tự đồng bộ riêng tư.':'Đã tắt tự đồng bộ; bản trên máy vẫn được giữ.')}
 function changed(){if(applying||!enabled||!owner)return;dirty=true;clearTimeout(timer);timer=setTimeout(()=>sync().catch(error=>status(error.message,{error:true})),5000)}
 async function sync({onlyIfRemoteChanged=false}={}){
  if(controller)return false;if(!owner)throw Error('Đăng nhập Google ở ảnh đại diện để đồng bộ.');
  const accountAtStart=owner;controller=new AbortController();const signal=controller.signal;dirty=false;
  const ensure=()=>{signal.throwIfAborted();if(owner!==accountAtStart)throw new DOMException('Tài khoản đã thay đổi','AbortError')};
  async function request(path,{method='GET',body,blob}={}){
   ensure();let token;try{token=getToken()}catch(error){error.status=401;throw error}if(!base)throw Error('Đồng bộ riêng tư đang được chuẩn bị.');const root=new URL(base);if(root.protocol!=='https:'&&!(['localhost','127.0.0.1'].includes(root.hostname)&&root.protocol==='http:'))throw Error('Dịch vụ đồng bộ chưa sẵn sàng.');
   const response=await fetcher(new URL('/v1/library'+path,root),{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:blob?{'Content-Type':blob.type}:{})},...(body?{body:JSON.stringify(body)}:blob?{body:blob}:{}),signal:AbortSignal.any([signal,AbortSignal.timeout(60000)])});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw Object.assign(Error(data.error||'Chưa kết nối được thư viện riêng. Hãy thử lại.'),{status:response.status})}return response;
  }
  try{
   const state=read(),baseline=state.baseline||{};await media.persist?.();
   if(onlyIfRemoteChanged&&!dirty){const remoteStatus=await(await request('/status')).json();if(remoteStatus.revision===state.revision)return true}
   for(let attempt=0;attempt<3;attempt++){
    ensure();const generation=getGeneration(),local=structuredClone(getQuestions());status('Đang giữ ảnh và nội dung trên máy…');
    const prepared=await prepareLibraryQuestions(local,{media,getBlob,getDetails,signal,onProgress:p=>status(`Đang giữ ảnh ${p.current}/${p.total} câu…`)});
    const remote=await(await request('/manifest')).json();if(!Number.isInteger(remote.revision)||!Array.isArray(remote.deleted))throw Error('Thông tin đồng bộ chưa hợp lệ.');remote.questions=validateLibraryQuestions(remote.questions);
    let merged=await mergePrivateLibrary({local:prepared.questions,remote:remote.questions,baseline,deleted:remote.deleted});
    if(merged.conflicts.length){const policy=await onConflict(merged.conflicts,{getImage:async q=>{ensure();if(!q.mediaId)return null;let blob=await media.get(q.mediaId);if(!blob){blob=await(await request('/media/'+q.mediaId)).blob();await media.put(blob,q.mediaId)}return blob}});ensure();if(!['local','remote'].includes(policy)){status('Có câu bị sửa khác nhau; đã giữ nguyên hai bản. Bấm Đồng bộ trong thư viện để chọn bản cần giữ.');return false}merged=await mergePrivateLibrary({local:prepared.questions,remote:remote.questions,baseline,deleted:remote.deleted,policy})}
    const ids=[...new Set(merged.questions.map(q=>q.mediaId).filter(Boolean))];if(ids.some(id=>!validMediaId(id)))throw Error('Thư viện có mã ảnh không hợp lệ.');
    for(let i=0;i<ids.length;i++){ensure();if(!await media.get(ids[i])){status(`Đang tải ảnh riêng ${i+1}/${ids.length} về thiết bị…`);const blob=await(await request('/media/'+ids[i])).blob();await media.put(blob,ids[i])}}
    const nextBaseline=await libraryBaseline(merged.questions),remoteBaseline=await libraryBaseline(remote.questions),canonical=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))),unchanged=canonical(nextBaseline)===canonical(remoteBaseline)&&JSON.stringify([...merged.deleted].sort())===JSON.stringify([...remote.deleted].sort());
    let commit={revision:remote.revision,updatedAt:remote.updatedAt};
    if(!unchanged){
    const {missing}=await(await request('/media/check',{method:'POST',body:{ids}})).json();if(!Array.isArray(missing)||missing.some(id=>!ids.includes(id)))throw Error('Không đọc được danh sách ảnh cần đồng bộ.');
    let cursor=0,done=0;async function upload(){while(cursor<missing.length){ensure();const id=missing[cursor++],blob=await media.get(id);if(!blob)throw Error('Thiếu ảnh trên máy. Hãy khôi phục bản sao lưu rồi thử lại.');await request('/media/'+id,{method:'PUT',blob});status(`Đang tải ảnh lên kho riêng ${++done}/${missing.length}…`)}}
    await Promise.all([upload(),upload()]);ensure();if(generation!==getGeneration())continue;
    try{commit=await(await request('/manifest',{method:'PUT',body:{revision:remote.revision,questions:merged.questions,deleted:merged.deleted}})).json()}catch(error){if([409,412].includes(error.status))continue;throw error}
    }
    ensure();if(generation!==getGeneration())continue;
    for(const q of merged.questions)if(q.mediaId)await media.link?.(q,q.mediaId);
    ensure();if(generation!==getGeneration())continue;
    applying=true;try{if(!await applyQuestions(merged.questions))throw Error('Chưa lưu được thư viện vào thiết bị. Bản riêng trên máy chủ vẫn được giữ.')}finally{applying=false}
    ensure();write({baseline:nextBaseline,lastSynced:Date.now(),revision:commit.revision,enabled});storage.setItem('sot-private-library-owner',owner);status(`Đã đồng bộ ${merged.questions.length} câu và ${ids.length} ảnh riêng tư.`,{success:true});return true;
   }
   throw Error('Thư viện vừa thay đổi trên thiết bị khác hoặc trên máy này. Các bản vẫn được giữ; hãy bấm Đồng bộ lại.');
  }catch(error){const canceled=signal.aborted||owner!==accountAtStart||error.name==='AbortError';controller?.abort();if(canceled){status('Đã dừng đồng bộ; dữ liệu trên máy vẫn được giữ.');return false}if(error.status===401){enabled=false;write({...read(),enabled:false})}status(error.message,{error:true});throw error}
  finally{controller=null;status('',{keepText:true});if(enabled&&dirty)changed()}
 }
 function watch(){if(!globalThis.document)return;let last=0;const poll=()=>{if(!enabled||!owner||controller||document.hidden||Date.now()-last<30000)return;last=Date.now();sync({onlyIfRemoteChanged:true}).catch(error=>status(error.message,{error:true}))};const interval=setInterval(poll,60000);window.addEventListener('focus',poll);document.addEventListener('visibilitychange',poll);return ()=>{clearInterval(interval);window.removeEventListener('focus',poll);document.removeEventListener('visibilitychange',poll)}}
 return {account,setEnabled,changed,sync,cancel,watch,isBusy:()=>!!controller,isApplying:()=>applying,get owner(){return owner},get enabled(){return enabled}};
}
