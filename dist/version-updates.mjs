export async function fetchRelease(url,{fetcher=fetch,signal}={}){
 const response=await fetcher(url,{cache:'no-store',signal});if(!response.ok)throw Error('Chưa kiểm tra được bản cập nhật.');
 const value=await response.json();if(typeof value.version!=='string'||! /^[a-zA-Z0-9._-]{1,80}$/.test(value.version))throw Error('Thông tin phiên bản không hợp lệ.');return value;
}
export function setupVersionUpdates({beforeUpdate=async()=>true,fetcher=fetch,reload=url=>location.assign(url),now=Date.now}={}){
 const current=document.querySelector('meta[name="app-version"]')?.content||'2026.11.14.1';
 const label=/^[a-f0-9]{40}$/.test(current)?current.slice(0,7):current;
 const controls=new Set();let latest=null,lastChecked=0,checking=null;
 const notice=document.createElement('div');notice.className='app-update-notice';notice.hidden=true;notice.setAttribute('role','status');
 const text=document.createElement('span');text.textContent='Có phiên bản mới. Dữ liệu đã lưu sẽ được giữ khi cập nhật.';notice.append(text);document.querySelector('#message')?.before(notice);
 async function update(){if(!latest||!await beforeUpdate())return;const url=new URL(location.href);url.searchParams.set('v',latest.version);reload(url.href)}
 function refresh(){notice.hidden=!latest;for(const entry of [...controls]){if(!entry.button.isConnected){controls.delete(entry);continue}entry.button.hidden=entry.compact&&!latest;entry.button.textContent=latest?'↑ Cập nhật':`v${label} · Kiểm tra cập nhật`;entry.button.title=latest?'Có phiên bản mới. Bấm để cập nhật.':`Phiên bản hiện tại: ${label}`}}
 function mount(container,{compact=false}={}){if(!container)return;const existing=container.querySelector('.app-update-control');if(existing)return;const button=document.createElement('button');button.type='button';button.className='secondary app-update-control';button.setAttribute('aria-label','Kiểm tra và cập nhật phiên bản web');button.onclick=()=>latest?update():check(true);container.append(button);controls.add({button,compact});refresh()}
 async function check(force=false){
  if(checking)return checking;if(!force&&(document.hidden||now()-lastChecked<60000))return;
  lastChecked=now();checking=(async()=>{try{const release=await fetchRelease(new URL('version.json',document.baseURI),{fetcher,signal:AbortSignal.timeout(8000)});if(release.version!==current)latest=release;refresh()}catch{/* Offline checks never interrupt study. */}finally{checking=null}})();return checking;
 }
 mount(document.querySelector('footer'));mount(notice,{compact:true});mount(document.querySelector('.top-actions'),{compact:true});
 const onVisible=()=>{if(!document.hidden)check()};document.addEventListener('visibilitychange',onVisible);window.addEventListener('focus',onVisible);
 const timer=setInterval(()=>check(),300000);setTimeout(()=>check(true),0);
 return {mount,check,dispose(){clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onVisible)}};
}
